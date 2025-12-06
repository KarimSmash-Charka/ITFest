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
    """Загружаем пользователей, если файла нет или он битый — возвращаем []"""
    if not os.path.exists(USER_FILE):
        return []
    with open(USER_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

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
    Многоходовый чат-эндпоинт для вкладки "Диалог".
    Плюс: при запросе оператора создаёт тикет и возвращает его номер.
 
    Ожидает JSON:
      {
        "text": "последнее сообщение пользователя",
        "history": [
          {"role": "user"|"assistant", "content": "..."},
          ...
        ],
        "email": "user@example.com"  # опционально, для связи с тикетами
      }
    Возвращает JSON: { "reply": "<ответ ИИ>", ...опционально ticket_id... }
    """
    data = request.get_json() or {}
    user_text = (data.get('text') or '').strip()
    history = data.get('history') or []
    user_email = (data.get('email') or '').strip().lower() or None
 
    # 1) Строим сообщения для ChatGPT с учётом истории
    system_text = (
        'Ты — дружелюбный ассистент службы поддержки.\n'
        'Отвечай коротко, по делу и на русском языке.\n'
        'Учитывай весь предыдущий контекст диалога, который видишь в истории.\n'
        'Если ситуация явно требует участия человека, можешь предложить перевод на оператора, '
        'но не придумывай номер тикета — его добавит система.'
    )
 
    messages = [
        {
            'role': 'system',
            'content': [{'type': 'text', 'text': system_text}],
        }
    ]
 
    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get('role') or 'user'
        content = item.get('content') or ''
        if not content:
            continue
        if role not in ('user', 'assistant', 'system'):
            role = 'user'
        messages.append(
            {'role': role, 'content': [{'type': 'text', 'text': content}]}
        )
 
    if user_text:
        messages.append(
            {'role': 'user', 'content': [{'type': 'text', 'text': user_text}]}
        )
 
    # 2) Получаем основной ответ от модели (если доступен)
    if openai_client is None:
        ai_reply = f'Эхо: {user_text}'
    else:
        try:
            completion = openai_client.chat.completions.create(
                model='gpt-4o-mini',
                messages=messages,
                temperature=0.4,
            )
            ai_reply = completion.choices[0].message.content or ''
        except Exception as e:
            print(f'[chat] OpenAI error: {e}', file=sys.stderr)
            ai_reply = (
                'Извините, сейчас не получается ответить через модель. '
                'Попробуйте ещё раз чуть позже.'
            )
 
    ai_reply = ai_reply.strip()
 
    #
    # 3) Проверяем, не просит ли пользователь «живого» оператора
    #
    lower_text = (user_text or '').lower()
    handoff_markers = [
        'оператору',
        'оператор',
        'живому человеку',
        'живой человек',
        'переведи на оператора',
        'переведите на оператора',
        'техподдерж',
        'тех поддерж',
        'поддержку человека',
        'сотрудника поддержки',
        'тех персоналу',
        'техперсоналу',
        'тех персонал',
        'техническому специалисту',
        'техническому персоналу',
        'специалисту поддержки',
        'службу поддержки',
        'служба поддержки',
        'связать с тех персоналом',
        'свяжи с тех персоналом',
    ]
    # Явный запрос оператора в текущем сообщении
    needs_handoff = any(m in lower_text for m in handoff_markers)
 
    # Дополнительно интерпретируем короткое "Да, пожалуйста" как согласие,
    # если предыдущий ответ ассистента предлагал перевести на оператора.
    if not needs_handoff and history:
        last_assistant_text = ''
        for item in reversed(history):
            if isinstance(item, dict) and (item.get('role') or 'user') == 'assistant':
                last_assistant_text = item.get('content') or ''
                break
 
        if last_assistant_text:
            assistant_lower = last_assistant_text.lower()
            assistant_offer_markers = [
                'могу передать вашему оператору',
                'могу передать оператору',
                'могу перевести на оператора',
                'перевести на оператора',
                'передам оператору',
                'передам в техподдержку',
                'передам в техническую поддержку',
                'могу подключить оператора',
            ]
            accept_markers = [
                'да.',
                'да,',
                'да пожалуйста',
                'да. пожалуйста',
                'да, пожалуйста',
                'да спасибо',
                'да, спасибо',
                'да, переводи',
                'да переводи',
                'ok',
                'ок',
                'хорошо, переводите',
                'можно',
            ]
 
            if any(m in assistant_lower for m in assistant_offer_markers) and any(
                m in lower_text for m in accept_markers
            ):
                needs_handoff = True
 
    ticket_payload = None
 
    if needs_handoff:
        # Собираем полный текст из всей истории пользователя
        user_history_parts = []
        for item in history:
            if not isinstance(item, dict):
                continue
            if (item.get('role') or 'user') != 'user':
                continue
            part = item.get('content') or ''
            if part:
                user_history_parts.append(part)
 
        full_text = '\n'.join(user_history_parts + [user_text]).strip() or user_text
 
        # Классифицируем запрос по тем же правилам, что и при создании тикета из формы
        language = detect_language(full_text)
        category = classify_category(full_text)
        priority = classify_priority(full_text)
        department, _auto_resolve, _need_human = decide_routing(category, full_text)
        auto_resolve = False
        need_human = True
        summary = build_summary_ru(category, full_text)
 
        tickets = load_tickets()
        next_numeric_id = (tickets[-1]['_id'] + 1) if tickets else 2000
        created_at = datetime.utcnow().strftime('%d.%m.%Y, %H:%M')
 
        # Готовим историю диалога для оператора
        dialog_history = []
        for item in history:
            if not isinstance(item, dict):
                continue
            role = item.get('role') or 'user'
            content = item.get('content') or ''
            if not content:
                continue
            if role not in ('user', 'assistant'):
                role = 'user'
            dialog_history.append({'role': role, 'text': content})

        if user_text:
            dialog_history.append({'role': 'user', 'text': user_text})
        if ai_reply:
            dialog_history.append({'role': 'assistant', 'text': ai_reply})

        ticket_record = {
            '_id': next_numeric_id,
            'id': f'#{next_numeric_id}',
            'source': 'Web',
            'category': category,
            'priority': priority,
            'department': department,
            'status': 'assigned',
            'created_at': created_at,
            'assigned_to': 'Operator',
            'summary': summary,
            'language': language,
            'last_text': user_text,
            'answer': ai_reply,
            'auto_resolve': auto_resolve,
            'need_human': need_human,
            'user_email': user_email,
            'history': dialog_history,
        }
 
        tickets.append(ticket_record)
        save_tickets(tickets)
 
        ticket_id_label = ticket_record['id']
 
        classification_block = (
            'Я классифицировал ваше обращение и передам его специалистам для детальной проверки.\n'
            f'• Категория: {category}.\n'
            f'• Приоритет: {priority}.\n'
            f'• Ответственный отдел: {department}.\n'
            f'Номер вашего тикета: {ticket_id_label}'
        )
 
        ai_reply = ai_reply + '\n\n' + classification_block
 
        ticket_payload = {
            'ticket_id': ticket_id_label,
            'category': category,
            'priority': priority,
            'department': department,
            'auto_resolve': auto_resolve,
            'need_human': need_human,
        }
 
    response = {'reply': ai_reply}
    if ticket_payload is not None:
        response.update(ticket_payload)
 
    return jsonify(response)


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
    user_email = (input_obj.get('user_email') or '').strip().lower() or None
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
                model='gpt-4o-mini',
                messages=[
                    {
                        'role': 'system',
                        'content': [{'type': 'text', 'text': system_prompt}],
                    },
                    {
                        'role': 'user',
                        'content': [{'type': 'text', 'text': user_prompt}],
                    },
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
        'user_email': user_email,
        # простая история диалога для оператора
        'history': [
            {'role': 'user', 'text': text},
            {'role': 'assistant', 'text': answer},
        ],
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

    # Если передан ?email=..., фильтруем тикеты конкретного пользователя
    email = (request.args.get('email') or '').strip().lower()
    if email:
        tickets = [t for t in tickets if (t.get('user_email') or '').lower() == email]

    return jsonify(tickets)


@app.route('/tickets/<ticket_id>', methods=['DELETE'])
def delete_ticket(ticket_id):
    """
    Удаление тикета по его ID (строка вида '1234' или '#1234').
    """
    tickets = load_tickets()
    if not tickets:
        return jsonify({'message': 'Нет тикетов для удаления'}), 404

    normalized = ticket_id if ticket_id.startswith('#') else f'#{ticket_id}'

    new_tickets = [t for t in tickets if t.get('id') != normalized]
    if len(new_tickets) == len(tickets):
        return jsonify({'message': 'Тикет не найден', 'ticket_id': normalized}), 404

    save_tickets(new_tickets)
    return jsonify({'message': 'Тикет удалён', 'ticket_id': normalized}), 200


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


@app.route('/translate', methods=['POST'])
def translate_dialog():
    """
    Перевод простого диалога (пользователь + ИИ + summary) на ru/kk.

    Ожидает JSON:
      {
        "target_language": "ru" | "kk",
        "user_text": "...",
        "ai_answer": "...",
        "summary": "..."
      }
    Возвращает JSON:
      { "user_text": "...", "ai_answer": "...", "summary": "..." }
    """
    data = request.get_json() or {}
    target_language = (data.get('target_language') or 'ru').strip().lower()
    if target_language not in ('ru', 'kk'):
        target_language = 'ru'

    user_text = data.get('user_text') or ''
    ai_answer = data.get('ai_answer') or ''
    summary = data.get('summary') or ''

    full_text = '\n'.join(
        part for part in [str(user_text), str(ai_answer), str(summary)] if part
    )

    # Если текст пустой — просто вернуть как есть
    if not full_text.strip():
        return jsonify(
            {
                'user_text': user_text,
                'ai_answer': ai_answer,
                'summary': summary,
            }
        )

    # Если язык уже совпадает с целевым — ничего не делаем
    detected = detect_language(full_text)
    if detected == target_language:
        return jsonify(
            {
                'user_text': user_text,
                'ai_answer': ai_answer,
                'summary': summary,
            }
        )

    # Если нет рабочего клиента OpenAI — возвращаем исходные тексты
    if openai_client is None:
        return jsonify(
            {
                'user_text': user_text,
                'ai_answer': ai_answer,
                'summary': summary,
            }
        )

    if target_language == 'kk':
        system_prompt = (
            'Сен аудармашысың.\n'
            'Барлық берілген мәтіндерді қазақ тіліне аудар. Мағынаны сақта, артық түсіндірме қоспа.\n'
            'Жауабыңды тек JSON форматында қайтар:\n'
            '{ "user_text": "...", "ai_answer": "...", "summary": "..." }'
        )
    else:
        system_prompt = (
            'Ты переводчик.\n'
            'Переведи все переданные тексты на русский язык. Сохрани смысл, не добавляй пояснений.\n'
            'Ответ верни строго в JSON-формате:\n'
            '{ "user_text": "...", "ai_answer": "...", "summary": "..." }'
        )

    user_prompt = json.dumps(
        {
            'user_text': user_text,
            'ai_answer': ai_answer,
            'summary': summary,
        },
        ensure_ascii=False,
    )

    translated_user = user_text
    translated_ai = ai_answer
    translated_summary = summary

    try:
        completion = openai_client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {
                    'role': 'system',
                    'content': [{'type': 'text', 'text': system_prompt}],
                },
                {
                    'role': 'user',
                    'content': [{'type': 'text', 'text': user_prompt}],
                },
            ],
            temperature=0.1,
        )
        content = completion.choices[0].message.content or ''
        try:
            parsed = json.loads(content)
            translated_user = parsed.get('user_text', translated_user)
            translated_ai = parsed.get('ai_answer', translated_ai)
            translated_summary = parsed.get('summary', translated_summary)
        except Exception:
            # Если не получилось распарсить JSON — используем исходные тексты
            pass
    except Exception as e:
        print(f'[translate] OpenAI error: {e}', file=sys.stderr)

    return jsonify(
        {
            'user_text': translated_user,
            'ai_answer': translated_ai,
            'summary': translated_summary,
        }
    )


@app.route('/summarize', methods=['POST'])
def summarize_dialog():
    """
    Делает краткое, но информативное summary по диалогу (пользователь + ответ ИИ).

    Ожидает JSON:
      {
        "user_text": "...",
        "ai_answer": "...",
        "summary": "..."   # опционально — существующее краткое summary
      }

    Возвращает JSON:
      { "summary": "..." }  # 2–4 предложения с описанием проблемы и статуса
    """
    data = request.get_json() or {}
    user_text = data.get('user_text') or ''
    ai_answer = data.get('ai_answer') or ''
    existing_summary = data.get('summary') or ''
    language = (data.get('language') or 'ru').strip().lower()
    if language not in ('ru', 'kk'):
        language = 'ru'

    base_text = (user_text or '').strip()
    if not base_text and ai_answer:
        base_text = ai_answer.strip()

    if not base_text:
        return jsonify({'summary': existing_summary or ''})

    # Если нет клиента OpenAI — fallback на rule-based summary
    if openai_client is None:
        rough = build_summary_ru('Другое', base_text)
        return jsonify({'summary': rough})

    if language == 'kk':
        system_prompt = (
            'Сен техникалық қолдау қызметінің ассистентісің.\n'
            'Саған тикет бойынша қысқа, бірақ мазмұнды summary жасау керек.\n'
            '2–4 сөйлем жаз:\n'
            '1) Пайдаланушының негізгі мәселесін қысқаша сипатта.\n'
            '2) Ағымдағы жағдайды белгіле (не істелді: ИИ немесе пайдаланушы не жасады).\n'
            '3) Қажет болса, оператор үшін келесі қадамды айт.\n'
            'Қазақ тілінде, артық «су» қоспай жаз, бірақ оператор толық хат-хабарды оқымай-ақ түсінетіндей болуы керек.'
        )

        user_prompt = (
            'Пайдаланушының мәтіні:\n'
            f'{user_text or "—"}\n\n'
            'ИИ жауабы (бар болса):\n'
            f'{ai_answer or "—"}\n\n'
            'Жоғарыдағы ережелер бойынша summary жаз.'
        )
    else:
        system_prompt = (
            'Ты — помощник службы поддержки, который делает краткое, но информативное summary тикета.\n'
            'Сделай 2–4 предложения, которые:\n'
            '1) Кратко опишут проблему пользователя.\n'
            '2) Покажут, что уже сделано (действия пользователя или ИИ).\n'
            '3) При необходимости укажут следующий шаг для оператора.\n'
            'Пиши на русском, без воды, чтобы оператор быстро понял суть без чтения всей переписки.'
        )

        user_prompt = (
            'Текст пользователя:\n'
            f'{user_text or "—"}\n\n'
            'Ответ ИИ (если есть):\n'
            f'{ai_answer or "—"}\n\n'
            'Сделай, пожалуйста, summary по правилам выше.'
        )

    try:
        completion = openai_client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {
                    'role': 'system',
                    'content': [{'type': 'text', 'text': system_prompt}],
                },
                {
                    'role': 'user',
                    'content': [{'type': 'text', 'text': user_prompt}],
                },
            ],
            temperature=0.2,
        )
        long_summary = completion.choices[0].message.content or ''
        return jsonify({'summary': long_summary.strip()})
    except Exception as e:
        print(f'[summarize] OpenAI error: {e}', file=sys.stderr)
        fallback = existing_summary or build_summary_ru('Другое', base_text)
        return jsonify({'summary': fallback})


@app.route('/tickets/<ticket_id>/resolve', methods=['POST'])
def resolve_ticket(ticket_id):
    """
    Пометка тикета как auto-resolved (подтверждение пользователем).
    """
    tickets = load_tickets()
    if not tickets:
        return jsonify({'message': 'Нет тикетов'}), 404

    normalized = ticket_id if ticket_id.startswith('#') else f'#{ticket_id}'
    updated_ticket = None

    for t in tickets:
        if t.get('id') == normalized:
            t['status'] = 'auto-resolved'
            t['auto_resolve'] = True
            updated_ticket = t
            break

    if updated_ticket is None:
        return jsonify({'message': 'Тикет не найден', 'ticket_id': normalized}), 404

    save_tickets(tickets)
    return jsonify(updated_ticket), 200

@app.route('/register', methods=['POST'])
def register():
    """
    Простая регистрация по email + паролю.

    Ожидает JSON: { "email": "...", "password": "..." }
    """
    data = request.get_json() or {}
    email = (data.get('email') or data.get('username') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'message': 'Укажите email и пароль'}), 400

    users = load_users()
    if any((u.get('email') or u.get('username', '')).lower() == email for u in users):
        return jsonify({'message': 'Пользователь с таким email уже существует'}), 409

    users.append({'email': email, 'password': password})
    save_users(users)
    return jsonify({'message': 'Регистрация прошла успешно', 'email': email}), 201


@app.route('/login', methods=['POST'])
def login():
    """
    Простой логин по email + паролю.

    Ожидает JSON: { "email": "...", "password": "..." }
    """
    data = request.get_json() or {}
    email = (data.get('email') or data.get('username') or '').strip().lower()
    password = data.get('password') or ''

    users = load_users()
    for user in users:
        stored_email = (user.get('email') or user.get('username', '')).lower()
        if stored_email == email and user.get('password') == password:
            return jsonify({'message': 'Успешно авторизировались', 'email': email}), 200
    return jsonify({'message': 'Неправильный email или пароль'}), 401


if __name__ == '__main__':
    app.run(debug=True, port=5000)