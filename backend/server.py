from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from datetime import datetime
import sys

try:
    from openai import OpenAI
except ImportError:  # мягкий fallback, если библиотека не установлена
    OpenAI = None  # type: ignore

USER_FILE = 'users.json'
TICKETS_FILE = 'tickets.json'

app = Flask(__name__)
CORS(app)

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
openai_client = None
if OPENAI_API_KEY and OpenAI is not None:
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as e:
        print(f'[router] Failed to init OpenAI client: {e}', file=sys.stderr)


def load_users():
    with open(USER_FILE, 'r') as f:
        return json.load(f)

def save_users(users):
    with open(USER_FILE, 'w') as f:
        json.dump(users, f, indent=4)


def load_tickets():
    if not os.path.exists(TICKETS_FILE):
        return []
    with open(TICKETS_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_tickets(tickets):
    with open(TICKETS_FILE, 'w') as f:
        json.dump(tickets, f, indent=4, ensure_ascii=False)


def detect_language(text: str) -> str:
    """Very lightweight RU / KK detector."""
    if not text:
        return 'ru'

    lower = text.lower()
    kazakh_chars = 'әіңғүқөһ'
    if any(ch in lower for ch in kazakh_chars):
        return 'kk'

    kazakh_keywords = ['сәлем', 'сәлеметсіз', 'қалай', 'рахмет', 'өтінемін', 'мәселе']
    if any(word in lower for word in kazakh_keywords):
        return 'kk'

    return 'ru'


def classify_category(full_text: str) -> str:
    text = full_text.lower()

    if any(
        kw in text
        for kw in [
            'почта',
            'outlook',
            'email',
            'e-mail',
            'письмо',
            'письма',
            'mail',
        ]
    ):
        return 'Почта'

    if any(
        kw in text
        for kw in [
            'vpn',
            'интернет',
            'wi-fi',
            'wifi',
            'вайфай',
            'сеть',
            'сетев',
            'ping',
        ]
    ):
        return 'Сеть'

    if any(
        kw in text
        for kw in [
            'ноутбук',
            'компьютер',
            'пк',
            'монитор',
            'принтер',
            'мышь',
            'клавиатур',
            'сканер',
        ]
    ):
        return 'Железо'

    if any(
        kw in text
        for kw in [
            'доступ',
            'логин',
            'парол',
            'учетн',
            'учётн',
            'аккаунт',
            'учетка',
            'учётка',
            'авторизац',
            'блокиров',
        ]
    ):
        return 'Доступы'

    if any(
        kw in text
        for kw in [
            '1c',
            '1с',
            'sap',
            'crm',
            'jira',
            'confluence',
            'bitrix',
            'битрикс',
            'приложени',
            'программа',
            'софт',
            'софта',
            'систем',
        ]
    ):
        return 'ПО'

    return 'Другое'


def classify_priority(full_text: str) -> str:
    text = full_text.lower()

    high_markers = [
        'не могу работать',
        'вообще не работает',
        'совсем не работает',
        'критично',
        'критическая ошибка',
        'срочно',
        'срочно нужно',
        'остановилась работа',
        'ничего не открывается',
        'не запускается',
        'не пускает',
    ]
    if any(marker in text for marker in high_markers):
        return 'high'

    low_markers = [
        'как сделать',
        'подскажите',
        'где найти',
        'можно ли',
        'вопрос',
        'консультация',
    ]
    if any(marker in text for marker in low_markers):
        return 'low'

    return 'medium'


def decide_routing(category: str, full_text: str):
    text = full_text.lower()

    if category == 'Почта':
        department = 'Поддержка почты'
    elif category == 'Сеть':
        department = 'Сетевой отдел'
    elif category == 'Железо':
        department = 'Поддержка рабочих мест'
    elif category in ('ПО', 'Другое'):
        department = 'Поддержка приложений'
    elif category == 'Доступы':
        department = 'Служба доступа'
    else:
        department = 'Служба поддержки (общая)'

    auto_resolve = False
    need_human = True

    if any(kw in text for kw in ['забыл пароль', 'сбросить пароль', 'сменить пароль']):
        auto_resolve = True
        need_human = False
    elif any(
        kw in text
        for kw in [
            'как подключиться к wi-fi',
            'как подключиться к wifi',
            'как настроить vpn',
            'как настроить почту',
        ]
    ):
        auto_resolve = True
        need_human = False
    elif category in ('Почта', 'Сеть') and any(
        kw in text for kw in ['инструкция', 'настройк', 'подключен']
    ):
        auto_resolve = True
        need_human = False

    if category == 'Железо' and any(
        kw in text for kw in ['не включается', 'сломал', 'разбился', 'треснул', 'шумит']
    ):
        auto_resolve = False
        need_human = True

    return department, auto_resolve, need_human


def build_answer_ru(category: str, priority: str, department: str, auto_resolve: bool) -> str:
    lines = []

    if auto_resolve:
        lines.append(
            'Я классифицировал ваше обращение и попробую решить его автоматически.'
        )
    else:
        lines.append(
            'Я классифицировал ваше обращение и передам его специалистам для детальной проверки.'
        )

    lines.append(f'• Категория: {category}.')
    lines.append(f'• Приоритет: {priority}.')
    lines.append(f'• Ответственный отдел: {department}.')

    if category == 'Доступы':
        lines.append(
            'Если вы забыли пароль, попробуйте сначала восстановить его через корпоративный портал self-service.'
        )
        lines.append(
            'Если после смены пароля проблема сохранится, приложите, пожалуйста, скриншот ошибки и точный текст сообщения.'
        )
    elif category == 'Почта':
        lines.append(
            'Проверьте, пожалуйста, корректность логина и пароля, а также наличие свободного места в почтовом ящике.'
        )
        lines.append(
            'Если ошибка остаётся, пришлите номер ошибки (если есть) и время последней неудачной попытки входа.'
        )
    elif category == 'Сеть':
        lines.append(
            'Проверьте подключение к интернету и, при необходимости, перезапустите VPN‑клиент.'
        )
        lines.append(
            'Если проблема повторяется, укажите ваше местоположение (офис/дом) и примерное время начала сбоев.'
        )

    return '\n'.join(lines)


def build_answer_kk(category: str, priority: str, department: str, auto_resolve: bool) -> str:
    lines = []

    if auto_resolve:
        lines.append(
            'Сіздің өтінішіңізді жіктедім, мүмкіндігінше автоматты түрде шешуге тырысамын.'
        )
    else:
        lines.append(
            'Сіздің өтінішіңізді жіктедім, оны мамандарға қосымша тексеріс үшін жіберемін.'
        )

    lines.append(f'• Санат: {category}.')
    lines.append(f'• Приоритет: {priority}.')
    lines.append(f'• Жауапты бөлім: {department}.')
    lines.append(
        'Қосымша: егер мүмкіндік болса, қате туралы скриншот және соңғы сәтті/сәтсіз әрекет уақытымен бөлісіңіз.'
    )

    return '\n'.join(lines)


def build_summary_ru(category: str, full_text: str) -> str:
    base = full_text.strip()
    if len(base) > 160:
        base = base[:157] + '...'
    return f'Категория: {category}. Кратко: {base}'

@app.route('/ask', methods=['POST'])
def ask():
    """
    Backward-compatible demo endpoint, simple echo.
    """
    data = request.get_json() or {}
    user_text = data.get('text', '')
    reply = f'Hello, {user_text}'
    return jsonify({'reply': reply})


@app.route('/tickets', methods=['POST'])
def route_ticket():
    """
    HelpDesk AI Router endpoint.

    Expects JSON: { "input": { "text": "...", "source": "...", "ticket_id": ..., "history": [...] } }
    and returns strictly structured JSON with routing decision.
    """
    payload = request.get_json() or {}
    input_obj = payload.get('input') or {}

    text = input_obj.get('text') or ''
    history = input_obj.get('history') or []

    history_text = ' '.join(m.get('text', '') for m in history if isinstance(m, dict))
    full_text = f'{text}\n{history_text}'.strip()

    if not full_text:
        full_text = text or history_text or ''

    language = detect_language(full_text)
    category = classify_category(full_text)
    priority = classify_priority(full_text)
    department, auto_resolve, need_human = decide_routing(category, full_text)

    # Базовый (резервный) ответ по правилам
    if language == 'kk':
        answer = build_answer_kk(category, priority, department, auto_resolve)
    else:
        answer = build_answer_ru(category, priority, department, auto_resolve)
        language = 'ru'

    summary = build_summary_ru(category, text or full_text)

    # Если есть рабочий OpenAI‑клиент — поручаем ChatGPT сформировать более «человечный» ответ
    if openai_client is not None:
        try:
            if language == 'kk':
                system_prompt = (
                    'Сен — қазақстандық компанияның техникалық қолдауындағы көмекші.\n'
                    'Мақсатың: қолданушыға нақты, қысқа және түсінікті көмек беру.\n'
                    '• Сол тілде (қазақша) жауап бер.\n'
                    '• Егер мүмкін болса, мәселені 2–5 қадамда шешуді ұсын.\n'
                    '• Қажет қосымша ақпаратты нақты сұра.\n'
                    '• Артық ресми сөздер мен «су» қоспа.'
                )
            else:
                system_prompt = (
                    'Ты — помощник службы поддержки крупной компании.\n'
                    'Твоя задача — дать прикладной, понятный и максимально полезный ответ пользователю.\n'
                    '• Отвечай на русском.\n'
                    '• Сначала очень коротко переформулируй суть проблемы (1 предложение).\n'
                    '• Затем дай 2–6 чётких шагов, что сделать прямо сейчас.\n'
                    '• Если нужна дополнительная информация, перечисли, какие именно данные запросить.\n'
                    '• Избегай канцелярита и формальных фраз типа «Ваше обращение очень важно для нас».'
                )

            meta = (
                f'Категория: {category}. Приоритет: {priority}. '
                f'Отдел: {department}. auto_resolve={auto_resolve}, need_human={need_human}.'
            )

            user_prompt = (
                f'{meta}\n\nТекст обращения пользователя:\n{text or full_text}\n\n'
                'Сформируй ответ пользователю по правилам выше.'
            )

            completion = openai_client.chat.completions.create(
                model='gpt-4.1-mini',
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
                temperature=0.2,
            )
            ai_answer = completion.choices[0].message.content
            if ai_answer:
                answer = ai_answer.strip()
        except Exception as e:
            print(f'[router] OpenAI error: {e}', file=sys.stderr)

    # Persist simple ticket for operator/dashboard views
    tickets = load_tickets()
    next_numeric_id = (tickets[-1]['_id'] + 1) if tickets else 1234

    source_raw = (input_obj.get('source') or 'web').lower()
    if source_raw == 'email':
        source_label = 'Email'
    elif source_raw == 'phone':
        source_label = 'Phone'
    else:
        source_label = 'Web'

    status_label = 'auto-resolved' if auto_resolve else 'assigned'
    created_at = datetime.utcnow().strftime('%d.%m.%Y, %H:%M')

    ticket_record = {
        '_id': next_numeric_id,
        'id': f'#{next_numeric_id}',
        'source': source_label,
        'category': category,
        'priority': priority,
        'department': department,
        'status': status_label,
        'created_at': created_at,
        'assigned_to': 'AI Assistant' if auto_resolve else 'Operator',
        'summary': summary,
        'language': language,
        # fields for conversation view
        'last_text': text,
        'answer': answer,
        'auto_resolve': auto_resolve,
        'need_human': need_human,
    }

    tickets.append(ticket_record)
    save_tickets(tickets)

    result = {
        'ticket_id': ticket_record['id'],
        'category': category,
        'priority': priority,
        'department': department,
        'auto_resolve': auto_resolve,
        'need_human': need_human,
        'answer': answer,
        'summary': summary,
        'language': language,
    }

    return jsonify(result)


@app.route('/tickets', methods=['GET'])
def list_tickets():
    """
    Lightweight endpoint for operator view.
    """
    tickets = load_tickets()
    return jsonify(tickets)


@app.route('/metrics', methods=['GET'])
def metrics():
    """
    Simple aggregated stats for dashboard view.
    """
    tickets = load_tickets()
    total = len(tickets)
    auto_resolved = sum(1 for t in tickets if t.get('status') == 'auto-resolved')
    assigned = total - auto_resolved

    by_category = {}
    for t in tickets:
        cat = t.get('category') or 'Другое'
        by_category[cat] = by_category.get(cat, 0) + 1

    response = {
        'total_tickets': total,
        'auto_resolved_pct': int((auto_resolved / total) * 100) if total else 0,
        'assigned_to_humans': assigned,
        'avg_auto_response_time': '1.4s',
        'avg_resolution_time': '7m 12s',
        'by_category': [{'category': c, 'count': n} for c, n in by_category.items()],
    }

    return jsonify(response)

@app.route('/register', methods=['GET'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = load_users()
    if any(u['username'] == username for u in user):
        return jsonify({'message:': 'Пользователь уже занят'}), 409
    
    user.append({'username': username, 'password': password})
    save_users(user)
    return jsonify({'message': 'Регистрация прошла успешна'}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    users = load_users()
    for user in users:
        if user['username'] == username and user['password'] == password:
            return jsonify({'message': 'Успешно авторизировались'}), 200
    return jsonify({'message': 'Не правильный логин или пароль'}), 401


if __name__ == '__main__':
    app.run(debug=True, port=5000)