import type { Lang } from '../types.js'

/**
 * All bot copy lives here, one key, both languages. Tone: a friend who
 * happens to watch gold prices for you. Short sentences, no jargon, no
 * corporate voice. HTML tags allowed (parse_mode HTML).
 *
 * A test asserts every key has both languages and identical placeholders,
 * so adding a language means adding one column here and fixing what the
 * test yells about.
 */
const MESSAGES = {
  choose_lang: {
    en: 'Pick your language / Pilih bahasa dulu ya 👇',
    id: 'Pick your language / Pilih bahasa dulu ya 👇',
  },
  lang_set: {
    en: "English it is 🤝 Say /help anytime you're lost.",
    id: 'Oke, kita pakai Bahasa Indonesia 🤝 Ketik /help kalau bingung.',
  },
  welcome: {
    en: "You're in! 🥇\n\nI watch EMASKU physical gold prices and ping you when they drop to your buy price.\n\nHow it works:\n1️⃣ /watch, then pick a size (1g, 5g, whatever you buy)\n2️⃣ Type your buy price, e.g. 2450000\n3️⃣ Done. I yell the moment it hits 🔔\n\nWant more? Just repeat /watch. You can stack several prices on one size (a buy ladder) or watch different sizes at the same time. /targets shows everything.\n\nOptional but handy: /ntfy sets up extra pushes that break through silent mode, so a target hit can actually wake you up. Free app, and I'll walk you through it 📳",
    id: 'Gas! 🥇\n\nAku mantau harga emas EMASKU dan ngabarin kamu begitu harganya turun ke harga incaranmu.\n\nCaranya:\n1️⃣ /watch, terus pilih ukuran (1g, 5g, terserah kamu)\n2️⃣ Ketik harga incaranmu, contoh 2450000\n3️⃣ Beres. Begitu kena, aku langsung teriak 🔔\n\nMau nambah? Tinggal /watch lagi. Bisa numpuk beberapa harga di satu ukuran (nyicil target), bisa juga mantau beberapa ukuran sekaligus. Semuanya kelihatan di /targets.\n\nOpsional tapi berguna: /ntfy buat push tambahan yang nembus mode senyap, jadi target kena bisa beneran bangunin kamu. Appnya gratis, nanti aku pandu 📳',
  },
  welcome_back: {
    en: 'Welcome back 👋 /watch adds a target, /targets shows what I\'m watching for you.',
    id: 'Halo lagi 👋 /watch buat nambah target, /targets buat lihat pantauanmu.',
  },
  help: {
    en: '💰 /price - today\'s gold price\n📊 /analyze - is now a good time to buy?\n🎯 /watch - set a price target\n📋 /targets - see or remove targets\n☀️ /digest - morning summary on/off\n📳 /ntfy - urgent alerts via the ntfy app\n🌐 /language - switch language\n❌ /cancel - back out of anything\n\nGood to know:\n• Repeat /watch to add more targets. Any mix works: EMASKU or Antam, three prices on 1g, one on 5g, up to 15 total\n• A target fires once, then re-arms after the price recovers. No spam\n• I check prices a few times a day; new prices usually land around 11am WIB\n• Telegram alerts respect silent mode. Want ones that don\'t? /ntfy gives you a personal channel in the free ntfy app, with step-by-step setup\n\nThis bot is free. If it earns its keep, /donate helps cover the server 💛',
    id: '💰 /price - harga emas hari ini\n📊 /analyze - sekarang waktu pas buat beli?\n🎯 /watch - pasang target harga\n📋 /targets - lihat atau hapus target\n☀️ /digest - ringkasan pagi on/off\n📳 /ntfy - alert urgent lewat aplikasi ntfy\n🌐 /language - ganti bahasa\n❌ /cancel - batalin apapun\n\nBiar nggak bingung:\n• /watch bisa diulang buat nambah target. Bebas campur: EMASKU atau Antam, tiga harga di 1g, satu di 5g, maksimal 15\n• Target cuma bunyi sekali, terus aktif lagi setelah harganya pulih. Nggak bakal spam\n• Aku cek harga beberapa kali sehari; harga baru biasanya keluar sekitar jam 11 WIB\n• Alert Telegram ikut mode senyap. Mau yang nembus? /ntfy kasih kamu channel pribadi di aplikasi gratis ntfy, lengkap sama panduannya\n\nBot ini gratis. Kalau kerasa kepake, /donate bantu biaya servernya 💛',
  },
  watch_pick_brand: {
    en: 'Which gold do you want to watch? 👇\n\nEMASKU has every bar size from 0.1g up. Antam is tracked per gram, current production year.',
    id: 'Mau mantau emas yang mana? 👇\n\nEMASKU ada semua ukuran dari 0.1g ke atas. Antam dipantau per gram, produksi tahun terbaru.',
  },
  watch_pick_size: {
    en: 'Which bar size do you want to watch? 👇',
    id: 'Mau mantau emas ukuran berapa? 👇',
  },
  watch_ask_target: {
    en: '{size} gold is at {price} right now (buyback {buyback}).\n\nType the price where you want me to yell at you. Example: 2450000 or 2.450.000',
    id: 'Emas {size} sekarang {price} (buyback {buyback}).\n\nKetik harga yang kamu mau, nanti aku teriak begitu nyampe. Contoh: 2450000 atau 2.450.000',
  },
  watch_ask_target_noprice: {
    en: 'Type your target price for {size} gold. Example: 2450000 or 2.450.000',
    id: 'Ketik target harga buat emas {size}. Contoh: 2450000 atau 2.450.000',
  },
  watch_saved: {
    en: 'Locked in 🎯 I\'ll ping you when {size} gold hits {target}.\nRight now it\'s {price}, so {gap} to go.\n\nMore targets? /watch again, any size.',
    id: 'Sip, kesimpen 🎯 Aku kabarin begitu emas {size} nyentuh {target}.\nSekarang masih {price}, kurang {gap} lagi.\n\nMau nambah? /watch lagi aja, ukuran bebas.',
  },
  watch_saved_above: {
    en: 'Saved, but heads up: {target} is already above the current price ({price}), so it will fire on my very next check. Not what you meant? Remove it via /targets.',
    id: 'Kesimpen, tapi fyi: {target} udah di atas harga sekarang ({price}), jadi bakal langsung bunyi pas pengecekan berikutnya. Kalau nggak sengaja, hapus lewat /targets ya.',
  },
  watch_duplicate: {
    en: 'You already have that exact target 😄 /targets to see the list.',
    id: 'Target itu udah ada 😄 Cek daftarnya di /targets.',
  },
  watch_limit: {
    en: 'That\'s {max} targets, which is the ceiling for now. Clear some old ones with /targets first.',
    id: 'Udah {max} target, itu batasnya dulu ya. Hapus yang lama lewat /targets dulu.',
  },
  invalid_price: {
    en: "Hmm, that doesn't look like a price 😅 Type it in rupiah, like 2450000 or 2.450.000. Or /cancel to bail.",
    id: 'Hmm, kayaknya itu bukan harga deh 😅 Ketik dalam rupiah, contohnya 2450000 atau 2.450.000. Atau /cancel kalau nggak jadi.',
  },
  price_out_of_range: {
    en: "That's really far from the current price ({price}), so I'm guessing a typo. Type it again, or /cancel.",
    id: 'Itu jauh banget dari harga sekarang ({price}), kayaknya typo deh. Ketik ulang ya, atau /cancel.',
  },
  targets_empty: {
    en: 'Nothing on the watchlist yet. /watch to set your first target 🎯',
    id: 'Belum ada target. Pasang dulu lewat /watch 🎯',
  },
  targets_header: {
    en: '<b>Your targets</b>\n{list}\n\n🟢 armed  🔕 hit, waiting for the price to recover\n\nTap one to remove it 👇',
    id: '<b>Target kamu</b>\n{list}\n\n🟢 aktif  🔕 udah kena, nunggu harga pulih\n\nKetuk buat hapus 👇',
  },
  target_deleted: {
    en: 'Gone 🗑',
    id: 'Udah kehapus 🗑',
  },
  target_gone: {
    en: 'That one was already gone.',
    id: 'Itu udah kehapus sebelumnya.',
  },
  cancel_done: {
    en: 'Cancelled 👌',
    id: 'Oke, batal 👌',
  },
  cancel_nothing: {
    en: 'Nothing to cancel. All good 👌',
    id: 'Nggak ada yang perlu dibatalin. Aman 👌',
  },
  digest_on: {
    en: 'Morning digest is ON ☀️ Every day around {time} WIB you\'ll get your gold summary. /digest to turn it off.',
    id: 'Ringkasan pagi AKTIF ☀️ Tiap sekitar jam {time} WIB aku kirim rangkuman emasmu. /digest lagi buat matiin.',
  },
  digest_off: {
    en: 'Morning digest is OFF. /digest whenever you miss me.',
    id: 'Ringkasan pagi MATI. /digest lagi kalau kangen.',
  },
  unknown: {
    en: "I don't know that one 😅 /help shows everything I can do.",
    id: 'Nggak ngerti 😅 /help buat lihat aku bisa apa aja.',
  },
  alert_hit_title: {
    en: '🔔 <b>Target hit!</b>',
    id: '🔔 <b>Target kena!</b>',
  },
  alert_hit_line: {
    en: '{size} gold is {price}, at or below your {target}',
    id: 'Emas {size} sekarang {price}, udah nyentuh target {target}',
  },
  alert_hit_footer: {
    en: 'Buyback {buyback} (spread {spread}). Your move 🥄',
    id: 'Buyback {buyback} (spread {spread}). Waktunya serok? 🥄',
  },
  alert_next_rung: {
    en: 'Next rung: {target}',
    id: 'Target berikutnya: {target}',
  },
  alert_dip: {
    en: '📉 <b>Dip alert</b>\n{size} gold dropped to {price}, {drop} below its {days}-day high ({high}).\nNo target crossed, but this might be worth a look.',
    id: '📉 <b>Ada dip nih</b>\nEmas {size} turun ke {price}, {drop} di bawah harga tertinggi {days} hari terakhir ({high}).\nBelum nyentuh target sih, tapi lumayan menarik.',
  },
  digest_title: {
    en: '☀️ <b>Morning gold check</b> · {date}',
    id: '☀️ <b>Cek emas pagi</b> · {date}',
  },
  digest_price_line: {
    en: '<b>{size}</b>: {price} ({change} vs yesterday), buyback {buyback}',
    id: '<b>{size}</b>: {price} ({change} dari kemarin), buyback {buyback}',
  },
  digest_price_line_nochange: {
    en: '<b>{size}</b>: {price}, buyback {buyback}',
    id: '<b>{size}</b>: {price}, buyback {buyback}',
  },
  digest_cheaper: {
    en: 'Cheaper than {pct} of the last {days} days',
    id: 'Lebih murah dari {pct} hari dalam {days} hari terakhir',
  },
  digest_trend_down: { en: 'Trend: drifting down', id: 'Tren: lagi turun pelan' },
  digest_trend_up: { en: 'Trend: climbing', id: 'Tren: lagi naik' },
  digest_trend_flat: { en: 'Trend: flat', id: 'Tren: datar aja' },
  digest_verdict_cheap: {
    en: 'Verdict: <b>CHEAP zone</b>, decent day to buy',
    id: 'Verdict: <b>ZONA MURAH</b>, hari yang oke buat beli',
  },
  digest_verdict_neutral: {
    en: 'Verdict: NEUTRAL, nothing special today',
    id: 'Verdict: NETRAL, biasa aja hari ini',
  },
  digest_verdict_expensive: {
    en: 'Verdict: EXPENSIVE zone, patience pays',
    id: 'Verdict: ZONA MAHAL, sabar dulu',
  },
  digest_driver_gold: {
    en: 'Mover: mostly world gold ({gold}), USD/IDR {fx}',
    id: 'Penggerak: emas dunia ({gold}), kurs USD/IDR {fx}',
  },
  digest_driver_fx: {
    en: 'Mover: mostly USD/IDR ({fx}), world gold {gold}',
    id: 'Penggerak: kurs USD/IDR ({fx}), emas dunia {gold}',
  },
  digest_driver_mix: {
    en: 'Mover: world gold {gold} plus USD/IDR {fx}',
    id: 'Penggerak: emas dunia {gold} plus kurs USD/IDR {fx}',
  },
  digest_driver_flat: {
    en: 'Mover: world gold and the rupiah are both flat',
    id: 'Penggerak: emas dunia sama rupiah lagi kalem dua-duanya',
  },
  digest_nearest: {
    en: '🎯 Nearest target: {target} ({gap} to go)',
    id: '🎯 Target terdekat: {target} (kurang {gap})',
  },
  digest_all_below: {
    en: '🎯 Price is below all your targets for this size',
    id: '🎯 Harga udah di bawah semua targetmu buat ukuran ini',
  },
  digest_no_watches: {
    en: 'You have the digest on but no targets yet. /watch to make mornings interesting.',
    id: 'Ringkasan pagimu nyala tapi belum ada target. /watch dulu biar tiap pagi ada yang ditunggu.',
  },
  price_title: {
    en: '<b>Gold right now</b> ({date})',
    id: '<b>Harga emas sekarang</b> ({date})',
  },
  price_line: {
    en: '• <b>{size}</b>: {price} · buyback {buyback}',
    id: '• <b>{size}</b>: {price} · buyback {buyback}',
  },
  price_all_title: {
    en: '<b>All gold prices today</b> ({date})',
    id: '<b>Semua harga emas hari ini</b> ({date})',
  },
  price_btn_all: {
    en: '📊 See every size and source',
    id: '📊 Lihat semua ukuran dan sumber',
  },
  price_hint: {
    en: 'Watching a size I didn\'t list? /watch and pick it, then /price shows it too.',
    id: 'Ukuran yang kamu pantau belum muncul? /watch dulu, nanti /price ikut nampilin.',
  },
  ntfy_intro: {
    en: '📳 ntfy is a second alert channel that can break through silent mode. Handy for "wake me up, gold is cheap".\n\nYour personal topic:\n<code>{topic}</code>\n\nSetup, 2 minutes:\n1️⃣ Install the ntfy app: ntfy.sh/app\n2️⃣ Tap +, subscribe to the topic above (server ntfy.sh)\n3️⃣ Done. Your target hits now also land there as urgent pushes\n\nKeep the topic name to yourself; anyone who knows it can read your alerts.',
    id: '📳 ntfy itu jalur alert kedua yang bisa nembus mode senyap. Cocok buat "bangunin aku kalau emas murah".\n\nTopic pribadimu:\n<code>{topic}</code>\n\nCaranya, 2 menit:\n1️⃣ Install aplikasi ntfy: ntfy.sh/app\n2️⃣ Tekan +, subscribe ke topic di atas (server ntfy.sh)\n3️⃣ Beres. Target kena bakal masuk situ juga sebagai push urgent\n\nJangan sebar nama topicnya ya; siapa aja yang tahu bisa baca alertmu.',
  },
  ntfy_btn_copy: {
    en: '📋 Copy topic',
    id: '📋 Salin topic',
  },
  ntfy_btn_off: {
    en: '🔕 Turn off ntfy',
    id: '🔕 Matiin ntfy',
  },
  ntfy_btn_new: {
    en: '🔄 New topic',
    id: '🔄 Ganti topic',
  },
  ntfy_off_done: {
    en: 'ntfy is off, alerts stay on Telegram only. /ntfy anytime to set it up again.',
    id: 'ntfy udah mati, alert cuma lewat Telegram. /ntfy lagi kapan aja kalau mau nyalain.',
  },
  ntfy_new_done: {
    en: 'Fresh topic made. The old one is dead, subscribe to this one instead 👇',
    id: 'Topic baru udah jadi. Yang lama mati, subscribe yang ini ya 👇',
  },
  analyze_pick_brand: {
    en: 'Which gold should I analyze? 👇\n\nI\'ll check today\'s price against the recorded history and tell you how it stacks up. Numbers only, no crystal ball.',
    id: 'Emas mana yang mau dianalisis? 👇\n\nAku bandingin harga hari ini sama riwayat harga yang tercatat, terus kasih tahu posisinya. Murni angka, bukan ramalan.',
  },
  analyze_pick_size: {
    en: 'Which bar size should I analyze? 👇',
    id: 'Ukuran berapa yang mau dianalisis? 👇',
  },
  analyze_title: {
    en: '📊 <b>{size} check</b> · {date}',
    id: '📊 <b>Cek {size}</b> · {date}',
  },
  analyze_price_line: {
    en: 'Price: {price} · buyback {buyback} (spread {spread})',
    id: 'Harga: {price} · buyback {buyback} (spread {spread})',
  },
  analyze_range_line: {
    en: '90-day range: {low} – {high}',
    id: 'Rentang 90 hari: {low} – {high}',
  },
  analyze_off_high: {
    en: 'Now {drop} below the 14-day high',
    id: 'Sekarang {drop} di bawah tertinggi 14 hari',
  },
  analyze_signals_title: {
    en: '<b>Buy signals: {score}/{max}</b>',
    id: '<b>Sinyal beli: {score}/{max}</b>',
  },
  analyze_sig_percentile: {
    en: 'Cheaper than most of the last 90 days',
    id: 'Lebih murah dari mayoritas 90 hari terakhir',
  },
  analyze_sig_range: {
    en: 'Near the bottom of the 90-day range',
    id: 'Dekat titik terendah rentang 90 hari',
  },
  analyze_sig_momentum: {
    en: 'At or below the 7-day average',
    id: 'Di bawah atau pas rata-rata 7 hari',
  },
  analyze_sig_dip: {
    en: 'Dipped 1%+ off the 14-day high',
    id: 'Turun 1%+ dari tertinggi 14 hari',
  },
  analyze_verdict_good: {
    en: '🟢 <b>Looks like a good day to buy.</b> Days this cheap haven\'t come often lately. Want an exact entry? /watch sets a target.',
    id: '🟢 <b>Kelihatannya hari yang bagus buat beli.</b> Hari semurah ini belakangan jarang. Mau nunggu harga pasti? Pasang target lewat /watch.',
  },
  analyze_verdict_ok: {
    en: '🟡 <b>Decent, not special.</b> Buying now is fine, waiting is fine too. A /watch target catches the better days for you.',
    id: '🟡 <b>Lumayan, tapi biasa aja.</b> Beli sekarang oke, nunggu juga oke. Target /watch bisa nangkepin hari yang lebih murah.',
  },
  analyze_verdict_wait: {
    en: '🔴 <b>Pricey by recent standards.</b> If you can wait, patience usually pays. Set a /watch target and let me do the waiting.',
    id: '🔴 <b>Tergolong mahal dibanding hari-hari terakhir.</b> Kalau bisa nunggu, sabar biasanya lebih untung. Pasang target /watch, biar aku yang nungguin.',
  },
  analyze_world: {
    en: 'World gold {gold}/oz · USD/IDR {fx}',
    id: 'Emas dunia {gold}/oz · kurs USD/IDR {fx}',
  },
  analyze_no_history: {
    en: 'I don\'t have enough price history for this size yet to judge the timing. Give me a few days of watching and ask again 🙏',
    id: 'Riwayat harga ukuran ini belum cukup buat nilai timingnya. Kasih aku beberapa hari buat mantau, terus tanya lagi ya 🙏',
  },
  analyze_footnote: {
    en: '<i>Pure statistics from recorded prices. Not a prediction, not financial advice.</i>',
    id: '<i>Murni statistik dari harga yang tercatat. Bukan prediksi, bukan saran keuangan.</i>',
  },
  analyze_btn_again: {
    en: '📊 Analyze another size',
    id: '📊 Analisis ukuran lain',
  },
  source_line: {
    en: 'Source: {source}',
    id: 'Sumber: {source}',
  },
  donate_message: {
    en: "PantauEmas is free and always will be. It does run on a small server though, and servers sadly don't accept gold.\n\nIf this bot ever caught a dip for you, a coffee-sized tip helps keep it awake and watching 💛",
    id: 'PantauEmas gratis dan bakal terus gratis. Tapi dia numpang hidup di server kecil, dan server sayangnya nggak nerima emas.\n\nKalau bot ini pernah nangkepin dip buat kamu, traktiran seharga kopi udah bantu banget biar dia tetap melek 💛',
  },
  donate_btn: {
    en: '💛 Tip via Saweria',
    id: '💛 Traktir via Saweria',
  },
  error_generic: {
    en: 'Something broke on my side 😬 Try again in a bit.',
    id: 'Ada yang error di sisiku 😬 Coba lagi bentar ya.',
  },
} as const

export type MessageKey = keyof typeof MESSAGES

export const SUPPORTED_LANGS: Lang[] = ['en', 'id']

export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  let text: string = MESSAGES[key][lang]
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/** Exported for the completeness test. */
export function allMessages(): Record<string, Record<Lang, string>> {
  return MESSAGES
}

export const BOT_COMMANDS: Record<Lang, Array<{ command: string; description: string }>> = {
  en: [
    { command: 'price', description: "💰 Today's gold price" },
    { command: 'analyze', description: '📊 Is now a good time to buy?' },
    { command: 'watch', description: '🎯 Set a price target' },
    { command: 'targets', description: '📋 See or remove your targets' },
    { command: 'digest', description: '☀️ Morning summary on/off' },
    { command: 'ntfy', description: '📳 Urgent alerts via ntfy' },
    { command: 'language', description: '🌐 Switch language' },
    { command: 'help', description: 'ℹ️ How this bot works' },
    { command: 'donate', description: '💛 Help cover the server' },
  ],
  id: [
    { command: 'price', description: '💰 Harga emas hari ini' },
    { command: 'analyze', description: '📊 Waktu pas buat beli?' },
    { command: 'watch', description: '🎯 Pasang target harga' },
    { command: 'targets', description: '📋 Lihat atau hapus target' },
    { command: 'digest', description: '☀️ Ringkasan pagi on/off' },
    { command: 'ntfy', description: '📳 Alert urgent lewat ntfy' },
    { command: 'language', description: '🌐 Ganti bahasa' },
    { command: 'help', description: 'ℹ️ Cara kerja bot ini' },
    { command: 'donate', description: '💛 Bantu biaya server' },
  ],
}
