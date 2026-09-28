"""Weekday 5 PM New York report; infrastructure failures fail and retry the task."""
from datetime import datetime, timedelta, timezone
import json
import os
import re

import pendulum
from airflow import DAG
from airflow.operators.python import PythonOperator

SYMBOLS = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BAC']
KEYSPACE = os.getenv('CASSANDRA_KEYSPACE', 'financial_data')
if not re.fullmatch(r'[a-z][a-z0-9_]*', KEYSPACE):
    raise ValueError('Invalid CASSANDRA_KEYSPACE')


def report_date(context):
    return context['data_interval_end'].in_timezone('America/New_York').to_date_string()


def redis_client():
    import redis
    return redis.Redis(host=os.getenv('REDIS_HOST', 'redis'), port=int(os.getenv('REDIS_PORT', '6379')),
                       password=os.getenv('REDIS_PASSWORD') or None, decode_responses=True,
                       socket_connect_timeout=5, socket_timeout=5)


def upload(key, value):
    import boto3
    client = boto3.client('s3', endpoint_url=os.getenv('S3_ENDPOINT'),
                          region_name=os.getenv('S3_REGION', 'us-east-1'),
                          aws_access_key_id=os.getenv('S3_ACCESS_KEY'),
                          aws_secret_access_key=os.getenv('S3_SECRET_KEY'))
    client.put_object(Bucket=os.getenv('S3_BUCKET', 'financial-dashboard'), Key=key,
                      Body=json.dumps(value), ContentType='application/json')


def generate_daily_report(**context):
    from cassandra.cluster import Cluster
    day = report_date(context)
    cluster = Cluster(os.getenv('CASSANDRA_CONTACT_POINTS', 'cassandra').split(','))
    analytics = []
    try:
        session = cluster.connect(KEYSPACE)
        for symbol in SYMBOLS:
            rows = session.execute('SELECT ts, price, volume FROM stock_prices WHERE symbol=%s AND bucket=%s', (symbol, day))
            result = None
            # Iterate all result pages, with constant memory per symbol. Cassandra returns newest first.
            for row in rows:
                if result is None:
                    result = dict(symbol=symbol, open=row.price, close=row.price, high=row.price,
                                  low=row.price, volume=0, tickCount=0)
                result['open'] = row.price
                result['high'] = max(result['high'], row.price)
                result['low'] = min(result['low'], row.price)
                result['volume'] += row.volume
                result['tickCount'] += 1
            if result:
                analytics.append(result)
    finally:
        cluster.shutdown()
    if not analytics:
        raise ValueError(f'No stored market ticks for {day}; refusing to publish a fabricated report')
    gainers = sum(row['close'] > row['open'] for row in analytics)
    losers = sum(row['close'] < row['open'] for row in analytics)
    ranked = sorted(analytics, key=lambda row: (row['close'] - row['open']) / row['open'])
    return dict(date=day, generatedAt=datetime.now(timezone.utc).isoformat(), scope='stored-day',
                source='kafka', simulated=True, topHeadlines=[], symbolAnalytics=analytics,
                marketSummary=dict(gainers=gainers, losers=losers, unchanged=len(analytics)-gainers-losers,
                                   totalSymbolsTracked=len(analytics), topGainer=ranked[-1]['symbol'],
                                   topLoser=ranked[0]['symbol'], totalVolume=sum(row['volume'] for row in analytics),
                                   marketSentiment='bullish' if gainers > losers else 'bearish' if losers > gainers else 'neutral'))


def archive_raw_data(**context):
    with redis_client() as client:
        raw = client.get('prices:all')
    if not raw:
        raise ValueError('No recent prices to archive')
    upload(f'raw-data/{report_date(context)}/snapshot.json', json.loads(raw))


def cleanup_old_redis_keys(**context):
    with redis_client() as client:
        client.ltrim('alerts:price_spike', 0, 49)


def send_report_to_s3(**context):
    report = context['ti'].xcom_pull(task_ids='generate_daily_report')
    if not report:
        raise ValueError('Daily report is missing')
    upload(f"daily-reports/{report['date']}/report.json", report)
    upload('daily-reports/latest.json', report)


with DAG('avsa_stock_daily_pipeline',
         default_args={'owner': 'avsa-stock', 'retries': 2, 'retry_delay': timedelta(minutes=5)},
         schedule_interval='0 17 * * 1-5',
         start_date=pendulum.datetime(2026, 1, 1, tz='America/New_York'), catchup=False,
         max_active_runs=1, tags=['avsa-stock']) as dag:
    report = PythonOperator(task_id='generate_daily_report', python_callable=generate_daily_report)
    archive = PythonOperator(task_id='archive_raw_data', python_callable=archive_raw_data)
    cleanup = PythonOperator(task_id='cleanup_old_redis_keys', python_callable=cleanup_old_redis_keys)
    publish = PythonOperator(task_id='send_report_to_s3', python_callable=send_report_to_s3)
    report >> [archive, cleanup] >> publish
