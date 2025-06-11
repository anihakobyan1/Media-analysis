from flask import Flask, request, jsonify
import json
from flask_cors import CORS
from data_fetcher import fetch_data_query  # Предполагается, что ваш объединённый клиент находится в этом модуле

app = Flask(__name__)
CORS(app)


def count_positive(query):
    articles = fetch_data_query(query_type='articles', query=query)  # Пример запроса
    if not articles:
        return None
    
    sentiment_counts = {
        'positive': 0,
        'negative': 0,
        'normal': 0
    }

    for article in articles:
        if article.positive > 0.6:
            sentiment_counts['positive'] += 1
        elif article.positive < 0.4:
            sentiment_counts['negative'] += 1
        else:
            sentiment_counts['normal'] += 1

    total = len(articles)
    return {
        'positive': round(sentiment_counts['positive'] / total * 100, 1),
        'negative': round(sentiment_counts['negative'] / total * 100, 1),
        'normal': round(sentiment_counts['normal'] / total * 100, 1)
    }

@app.route('/api/sentiment', methods=['GET'])
def get_sentiment_stats():
    try:
        query = request.args.get('query', '')  # параметры по умолчанию
        stats = count_positive(query)
        if stats is None:
            return jsonify({'error': 'Failed to fetch articles'}), 500
        
        return jsonify(stats)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/fetch-data', methods=['GET'])
def fetch_data():
    # Получаем параметры из запроса
    query_type = request.args.get('type', 'chart')  # По умолчанию 'chart'
    query = request.args.get('query', '')          # Пустая строка по умолчанию
    
    # Валидация типа запроса
    if query_type not in ['chart', 'articles']:
        return jsonify({
            'error': 'Invalid query type. Use "chart" or "articles"'
        }), 400
    
    try:
        # Вызываем объединённую функцию fetch_data
        result = fetch_data_query(
            query_type=query_type,
            query=query
        )
        
        # Если результат None (ошибка на стороне сервера)
        if result is None:
            return jsonify({
                'error': 'Failed to fetch data from the server'
            }), 500
        
        # Для статей преобразуем в список словарей (dataclass не сериализуется в JSON напрямую)
        if query_type == 'articles':
            result = [article.__dict__ for article in result]
        
        # Возвращаем результат с правильными заголовками
        response = app.response_class(
            response=json.dumps(result, ensure_ascii=False),
            status=200,
            mimetype='application/json; charset=utf-8'
        )
        return response
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'details': f'Failed to process {query_type} request'
        }), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)