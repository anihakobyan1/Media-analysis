import socket
import struct
from io import BytesIO
from dataclasses import dataclass
from typing import List, Dict, Any, Union

# --- Типы пакетов ---
class PacketType:
    GET_DATA_CHART   = 0x20
    GET_RECENT_NEWS  = 0x08
    SEARCH_QUERY     = 0x40
    ARTICLE_SET      = 0x06
    DATA_PAYLOAD     = 0x07
    ERROR            = 0x03
    REGISTER_REQUEST = 0x33

# --- Модель статьи ---
@dataclass
class Article:
    hash: str
    site: str
    tag: str
    title: str
    link: str
    content: str
    date: str
    viewsAll: str
    viewsDay: str
    viewsWeek: str
    viewsMonth: str
    positive: float

    def __str__(self):
        return (
            f"Hash: {self.hash}\n"
            f"Site: {self.site}\n"
            f"Tag: {self.tag}\n"
            f"Title: {self.title}\n"
            f"Link: {self.link}\n"
            f"Content: {self.content[:100]}...\n"
            f"Date: {self.date}\n"
            f"ViewsAll: {self.viewsAll}\n"
            f"ViewsDay: {self.viewsDay}\n"
            f"ViewsWeek: {self.viewsWeek}\n"
            f"ViewsMonth: {self.viewsMonth}\n"
            f"Positive: {self.positive:.4f}\n"
        )

# --- Утилиты ---
def recv_all(sock: socket.socket, n: int) -> bytes:
    data = b''
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise ConnectionError("Соединение закрыто")
        data += chunk
    return data

def serialize_string(s: str) -> bytes:
    b = s.encode('utf-8')
    return struct.pack('>I', len(b)) + b

class Packet:
    def __init__(self, type_: int, data: bytes = b''):
        self.type = type_
        self.data = data

class PacketSerializer:
    @staticmethod
    def serialize(packet: Packet) -> bytes:
        return struct.pack('B', packet.type) + struct.pack('>I', len(packet.data)) + packet.data

    @staticmethod
    def deserialize(sock: socket.socket) -> Packet:
        type_byte = recv_all(sock, 1)
        ptype = type_byte[0]
        length = struct.unpack('>I', recv_all(sock, 4))[0]
        data = recv_all(sock, length) if length > 0 else b''
        return Packet(ptype, data)

    @staticmethod
    def deserialize_article_set(data: bytes) -> List[Article]:
        buf = BytesIO(data)
        count = struct.unpack('>I', buf.read(4))[0]
        articles = []

        for _ in range(count):
            article_length = struct.unpack('>I', buf.read(4))[0]
            article_data = buf.read(article_length)
            article_buf = BytesIO(article_data)

            fields = []
            for _ in range(11):
                str_length = struct.unpack('>I', article_buf.read(4))[0]
                fields.append(article_buf.read(str_length).decode('utf-8'))

            positive = struct.unpack('>d', article_buf.read(8))[0]
            articles.append(Article(*fields, positive))

        return articles

    @staticmethod
    def deserialize_map(data: bytes) -> Dict[str, int]:
        offset = 0
        size = struct.unpack_from('>I', data, offset)[0]
        offset += 4
        result = {}
        for _ in range(size):
            key_len = struct.unpack_from('>I', data, offset)[0]
            offset += 4
            key = data[offset:offset + key_len].decode('utf-8')
            offset += key_len
            value = struct.unpack_from('>I', data, offset)[0]
            offset += 4
            result[key] = value
        return result

# --- Основной клиент ---
def fetch_data_query(
        query_type: str,
        query: str = "",
        server_ip: str = 'kinetic-world-dynamic.ru',
        server_port: int = 3500
    ) -> Union[Dict[str, int], List[Article], None]:
    """
    Получает данные с сервера в зависимости от типа запроса
    
    :param query_type: Тип запроса ('chart' или 'articles')
    :param query: Строка запроса
    :param server_ip: IP сервера
    :param server_port: Порт сервера
    :return: Для 'chart' - словарь данных, для 'articles' - список статей
    """
    try:
        with socket.create_connection((server_ip, server_port)) as sock:
            # Отправка идентификатора клиента
            client_id = 'Analytical'
            id_bytes = client_id.encode('utf-8')
            sock.sendall(struct.pack('>I', len(id_bytes)) + id_bytes)

            # Получение ответа от сервера
            resp = PacketSerializer.deserialize(sock)
            if resp.type == PacketType.ERROR:
                print("Ошибка сервера:", resp.data.decode('utf-8'))
                return None

            # Отправка основного запроса
            if query_type == 'chart':
                query_bytes = serialize_string(query)
                packet = Packet(PacketType.GET_DATA_CHART, query_bytes)
            elif query_type == 'articles':
                query_bytes = serialize_string(query)
                packet = Packet(PacketType.SEARCH_QUERY, query_bytes)
            else:
                raise ValueError("Неизвестный тип запроса. Используйте 'chart' или 'articles'")
            
            sock.sendall(PacketSerializer.serialize(packet))

            # Получение ответа
            data_resp = PacketSerializer.deserialize(sock)
            
            if query_type == 'chart' and data_resp.type == PacketType.DATA_PAYLOAD:
                return PacketSerializer.deserialize_map(data_resp.data)
            elif query_type == 'articles' and data_resp.type == PacketType.ARTICLE_SET:
                return PacketSerializer.deserialize_article_set(data_resp.data)
            else:
                print(f"Неожиданный тип пакета в ответе: {hex(data_resp.type)}")
                return None

    except Exception as e:
        print(f'Ошибка: {e}')
        return None


def count_positive():
    articles = fetch_data_query()
    if articles:
        # Подсчёт количества статей каждой тональности
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

        # Общее количество статей
        total_articles = len(articles)

        # Расчёт процентов
        sentiment_percentages = {
            'positive': (sentiment_counts['positive'] / total_articles) * 100,
            'negative': (sentiment_counts['negative'] / total_articles) * 100,
            'normal': (sentiment_counts['normal'] / total_articles) * 100
        }
        
        return sentiment_percentages