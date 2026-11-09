"""
Xin Aiii / X-Site Casino - Customer Service Telegram Bot (Python)
==================================================================
Requirements:
    pip install pyTelegramBotAPI requests

Configuration:
    1. Replace BOT_TOKEN with your Telegram Bot Token from @BotFather
    2. Replace WEBAPP_API_URL with your live webapp URL (e.g. https://xsite-casino.vercel.app)
    3. Replace BOT_API_KEY with your configured secret key
    4. Set ADMIN_TELEGRAM_IDS to your own Telegram Chat ID(s)
"""

import telebot
import requests
import os

# 1. BOT & SERVER SETTINGS
BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_FROM_BOTFATHER"
WEBAPP_API_URL = "https://xsite-casino.vercel.app"  # သို့မဟုတ် မိမိ App URL
BOT_API_KEY = os.environ.get("BOT_API_KEY", "")    # Set the same secret as the web app

# လုံခြုံရေးအတွက် Bot ကို အသုံးပြုခွင့်ရှိသော Admin Telegram ID များ (မိမိ Telegram ID ထည့်ပါ)
ADMIN_TELEGRAM_IDS = [
    # ဥပမာ: 123456789
]

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# Helper to send API requests to the Webapp
def api_request(method, endpoint, params=None, json_data=None):
    headers = {
        "x-bot-token": BOT_API_KEY,
        "Content-Type": "application/json"
    }
    url = f"{WEBAPP_API_URL.rstrip('/')}/api/bot/{endpoint.lstrip('/')}"
    try:
        if method.upper() == "GET":
            res = requests.get(url, headers=headers, params=params, timeout=15)
        else:
            res = requests.post(url, headers=headers, json=json_data, timeout=15)
        return res.json()
    except Exception as e:
        return {"success": False, "error": f"Server ချိတ်ဆက်မှု မအောင်မြင်ပါ: {str(e)}"}

# Admin Check Filter
def is_admin(message):
    if not ADMIN_TELEGRAM_IDS:
        return False  # Fail closed until real admin IDs are configured
    return message.from_user.id in ADMIN_TELEGRAM_IDS

# /start command
@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    welcome_text = (
        "🎲 <b>X-Site Casino Customer Service Bot</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "မင်္ဂလာပါ Admin! ဤ Bot ဖြင့် Webapp Database ကို တိုက်ရိုက် စီမံခန့်ခွဲနိုင်ပါသည်:\n\n"
        "🔍 <b>/user &lt;id/phone&gt;</b> - User အချက်အလက် & Balance ကြည့်ရန်\n"
        "💰 <b>/topup &lt;id&gt; &lt;amount&gt; [note]</b> - User ထံ ငွေဖြည့်ပေးရန်\n"
        "🔻 <b>/deduct &lt;id&gt; &lt;amount&gt; [note]</b> - User ထံမှ ငွေနုတ်ယူရန်\n"
        "📥 <b>/pending</b> - ဆိုင်းငံ့ ငွေသွင်း/ငွေထုတ် စာရင်းများ စစ်ရန်\n"
        "✅ <b>/approve &lt;deposit_id&gt;</b> - ငွေသွင်းအတည်ပြုပြီး Balance တိုးပေးရန်\n"
        "❌ <b>/decline &lt;deposit_id&gt; [reason]</b> - ငွေသွင်းပယ်ချရန်\n"
        "📊 <b>/stats</b> - ကာစီနို စုစုပေါင်းစာရင်းချုပ် ကြည့်ရန်\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 သင်၏ Telegram ID: <code>{message.from_user.id}</code>"
    )
    bot.reply_to(message, welcome_text)

# /user command: lookup user
@bot.message_handler(commands=['user', 'info'])
def handle_user_lookup(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        return bot.reply_to(message, "⚠️ User ID သို့မဟုတ် ဖုန်းနံပါတ် ရိုက်ထည့်ပါ:\nဥပမာ: <code>/user usr_12345</code> သို့မဟုတ် <code>/user 09753499023</code>")
    
    query = args[1].strip()
    bot.send_chat_action(message.chat.id, 'typing')
    
    data = api_request("GET", "user", params={"query": query})
    if not data.get("success"):
        return bot.reply_to(message, f"❌ ရှာမတွေ့ပါ: {data.get('error')}")
    
    bot.reply_to(message, data.get("formattedText", "User Found"))

# /topup command: add balance
@bot.message_handler(commands=['topup', 'add'])
def handle_topup(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    parts = message.text.split(maxsplit=3)
    if len(parts) < 3:
        return bot.reply_to(message, "⚠️ အသုံးပြုနည်း:\n<code>/topup &lt;User_ID&gt; &lt;ငွေပမာဏ&gt; [အကြောင်းပြချက်]</code>\nဥပမာ: <code>/topup usr_abc 10000 KPay ငွေလွှဲ</code>")
    
    uid = parts[1].strip()
    try:
        amount = int(parts[2].replace(",", ""))
    except ValueError:
        return bot.reply_to(message, "❌ ငွေပမာဏ မှားယွင်းနေပါသည်။ ဂဏန်းအတိအကျ ရိုက်ထည့်ပါ။")
    
    note = parts[3].strip() if len(parts) > 3 else "CS Admin Topup via Bot"
    admin_name = f"Telegram Admin ({message.from_user.first_name})"
    
    bot.send_chat_action(message.chat.id, 'typing')
    data = api_request("POST", "balance", json_data={
        "uid": uid,
        "amount": amount,
        "action": "topup",
        "note": note,
        "adminName": admin_name
    })
    
    if not data.get("success"):
        return bot.reply_to(message, f"❌ မအောင်မြင်ပါ: {data.get('error')}")
    
    bot.reply_to(message, data.get("formattedText", "Topup Success"))

# /deduct command: deduct balance
@bot.message_handler(commands=['deduct', 'sub'])
def handle_deduct(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    parts = message.text.split(maxsplit=3)
    if len(parts) < 3:
        return bot.reply_to(message, "⚠️ အသုံးပြုနည်း:\n<code>/deduct &lt;User_ID&gt; &lt;ငွေပမာဏ&gt; [အကြောင်းပြချက်]</code>\nဥပမာ: <code>/deduct usr_abc 5000 အလောင်းအစားပြင်ဆင်မှု</code>")
    
    uid = parts[1].strip()
    try:
        amount = int(parts[2].replace(",", ""))
    except ValueError:
        return bot.reply_to(message, "❌ ငွေပမာဏ မှားယွင်းနေပါသည်။")
    
    note = parts[3].strip() if len(parts) > 3 else "CS Admin Deduction via Bot"
    admin_name = f"Telegram Admin ({message.from_user.first_name})"
    
    bot.send_chat_action(message.chat.id, 'typing')
    data = api_request("POST", "balance", json_data={
        "uid": uid,
        "amount": amount,
        "action": "deduct",
        "note": note,
        "adminName": admin_name
    })
    
    if not data.get("success"):
        return bot.reply_to(message, f"❌ မအောင်မြင်ပါ: {data.get('error')}")
    
    bot.reply_to(message, data.get("formattedText", "Deduction Success"))

# /pending command: view pending lists
@bot.message_handler(commands=['pending'])
def handle_pending(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    bot.send_chat_action(message.chat.id, 'typing')
    data = api_request("GET", "pending")
    if not data.get("success"):
        return bot.reply_to(message, f"❌ မအောင်မြင်ပါ: {data.get('error')}")
    
    if data.get("formattedText"):
        return bot.reply_to(message, data.get("formattedText"))
    
    deps = data.get("deposits", [])
    withs = data.get("withdrawals", [])
    
    res_text = (
        f"📋 <b>ဆိုင်းငံ့ ငွေသွင်း/ငွေထုတ် စာရင်းများ</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📥 ငွေသွင်း စစ်ဆေးရန်: <b>{len(deps)}</b> ခု\n"
        f"📤 ငွေထုတ် စစ်ဆေးရန်: <b>{len(withs)}</b> ခု\n\n"
    )
    
    if deps:
        res_text += "<b>[ငွေသွင်းတောင်းဆိုမှုများ]</b>\n"
        for d in deps[:8]:
            dep_id = d.get('depositId') or d.get('id')
            amt = d.get('amount', 0)
            phone = d.get('phone') or '-'
            trx = d.get('trxLast5') or d.get('receiptImage') or '-'
            res_text += f"• <code>{dep_id}</code> | {phone} | <b>{amt:,} Ks</b>\n  💳 ငွေလွှဲ ID (နောက်ဆုံး ၅ လုံး): <code>{trx}</code>\n  👉 အတည်ပြုရန်: <code>/approve {dep_id}</code>\n"
        res_text += "\n"
    
    if withs:
        res_text += "<b>[ငွေထုတ်တောင်းဆိုမှုများ]</b>\n"
        for w in withs[:8]:
            w_id = w.get('withdrawalId') or w.get('id')
            amt = w.get('amount', 0)
            name = w.get('accountName') or '-'
            phone = w.get('phone') or '-'
            res_text += f"• <code>{w_id}</code> | {name} ({phone}) | <b>{amt:,} Ks</b>\n"
    
    res_text += "━━━━━━━━━━━━━━━━━━"
    bot.reply_to(message, res_text)

# /approve command: approve deposit
@bot.message_handler(commands=['approve'])
def handle_approve_deposit(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        return bot.reply_to(message, "⚠️ Deposit ID ရိုက်ထည့်ပါ: <code>/approve dep_12345</code>")
    
    dep_id = args[1].strip()
    bot.send_chat_action(message.chat.id, 'typing')
    data = api_request("POST", "review", json_data={
        "type": "deposit",
        "id": dep_id,
        "action": "approve"
    })
    
    if not data.get("success"):
        return bot.reply_to(message, f"❌ မအောင်မြင်ပါ: {data.get('error')}")
    
    bot.reply_to(message, f"✅ {data.get('message')}")

# /stats command: overall dashboard
@bot.message_handler(commands=['stats'])
def handle_stats(message):
    if not is_admin(message):
        return bot.reply_to(message, "⛔ သင်သည် Admin မဟုတ်သဖြင့် အသုံးပြုခွင့်မရှိပါ။")
    
    bot.send_chat_action(message.chat.id, 'typing')
    data = api_request("GET", "stats")
    if not data.get("success"):
        return bot.reply_to(message, f"❌ မအောင်မြင်ပါ: {data.get('error')}")
    
    bot.reply_to(message, data.get("formattedText", "Stats Overview"))

if __name__ == '__main__':
    print("🚀 Telegram Customer Service Bot is starting polling...")
    bot.infinity_polling()
