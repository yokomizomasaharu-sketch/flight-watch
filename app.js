/* ============================================================
   フライトウォッチ  (flight-watch)
   ・監視中のセール／おすすめ便／ホテル → 詳細 → 公式予約ページ
   ・予約控え（航空券・ホテル・パック）と経費バッジ、領収書
   ・見積書の発行（印刷/PDF・コピー・記録）
   ・監視リクエスト作成（種別・自動予約・支払い方法・座席・手荷物）
   ・設定：パスポート / 支払い方法（カード・コンビニ）/ 会員番号 / 4桁PIN
   ・共有モード（個人情報オフ）で画面から個人情報を完全に隠す
   データは端末内 localStorage のみ。外部送信はしない。
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'pickle.flightwatch.v1';
  var FEED = window.FLIGHT_WATCH_DATA || { deals: [], trips: [], updatedAt: '' };
  var PERSONAL = window.FLIGHT_WATCH_PERSONAL || null;

  var AIRPORT_LABEL = { KIX: '関空', ITM: '伊丹', HND: '羽田', NRT: '成田' };
  var AREA_LABEL = { taiwan: '台湾・香港', asia: '韓国・アジア', europe: 'ヨーロッパ', domestic: '国内線', other: 'その他' };
  var AREA_CHIPS = [
    { k: 'taiwan', l: '台湾' },
    { k: 'asia', l: '韓国・アジア' },
    { k: 'europe', l: 'ヨーロッパ' },
    { k: 'domestic', l: '国内線' }
  ];
  var FILTERS = [
    { k: 'all', l: 'すべて' },
    { k: 'taiwan', l: '台湾' },
    { k: 'asia', l: 'アジア' },
    { k: 'europe', l: 'ヨーロッパ' },
    { k: 'domestic', l: '国内線' },
    { k: 'live', l: '開催中' },
    { k: 'star', l: '★ウォッチ' }
  ];
  var KIND_FILTERS = [
    { k: 'all', l: 'すべて' },
    { k: 'flight', l: '✈️ 航空券' },
    { k: 'hotel', l: '🛏 ホテル' },
    { k: 'package', l: '🧳 パック' }
  ];
  var PRODUCT_LABEL = { flight: '航空券', hotel: 'ホテル', package: '航空券＋ホテル' };
  var PRODUCT_PILL = { flight: '', hotel: 'ホテル', package: 'パック' };
  var CONV_STORES = ['指定なし（最寄り優先）', 'セブン-イレブン', 'ローソン（Loppi）', 'ファミリーマート', 'ミニストップ'];
  var HOTEL_CHAINS = ['指定なし', '東横イン', 'ドーミーイン', '相鉄フレッサイン', 'APA', 'ルートイン', 'その他'];
  var SEAT_OPTS = ['指定なし', '窓側', '通路側'];
  var BAG_OPTS = ['指定なし', 'なし（機内持込のみ）', '20kg', '23kg', '追加料金OK'];

  /* ---------------- 状態 ---------------- */
  var state = {
    marks: {},
    userDeals: [],
    trips: [],
    requests: [],
    quotes: [],
    passport: {},
    payment: { cards: [], defaultId: '', conv: { store: CONV_STORES[0], memo: '' } },
    mileage: [],
    prefs: { airports: [], areas: [], nights: '', time: '', budget: '' },
    lock: { salt: '', hash: '' },
    unlocked: false,
    shareMode: false,
    revealed: {},
    filter: 'all',
    filterKind: 'all',
    tripKind: 'all',
    showPass: false,
    showMiles: false,
    editingRequest: null,
    editingTrip: null,
    seeded: false,
    activeTab: 'watch'
  };

  var feedDeals = [];
  var feedTrips = [];

  /* ---------------- 小物 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var uidSeq = 0;
  function uid(p) { uidSeq += 1; return p + Date.now().toString(36) + uidSeq.toString(36); }

  function todayISO() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function parseISO(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    var t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }
  function dayDiff(fromISO, toISO) {
    var a = parseISO(fromISO), b = parseISO(toISO);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function fmtDate(iso, withYear) {
    var d = parseISO(iso);
    if (!d) return iso || '—';
    var s = (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')';
    if (withYear) s = d.getFullYear() + '/' + s;
    return s;
  }
  function fmtDateSlash(iso) {
    var d = parseISO(iso);
    if (!d) return iso || '—';
    return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2);
  }
  function yen(n) {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    return '¥' + Number(n).toLocaleString('ja-JP');
  }
  function monthsOf(days) { return days / 30.4375; }
  function fmtMonths(m) {
    if (m < 1) return Math.max(0, Math.round(m * 30)) + '日';
    var y = Math.floor(m / 12), mo = Math.floor(m % 12);
    if (y > 0) return y + '年' + (mo > 0 ? mo + 'ヶ月' : '');
    return mo + 'ヶ月';
  }
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ''; }, 2400);
  }
  function signal(msg) {
    try {
      if (window.pickle && pickle.widget && typeof pickle.widget.signal === 'function') pickle.widget.signal(msg);
    } catch (e) { /* noop */ }
  }
  function inWidget() {
    try {
      if (window.pickle && pickle.widget) return true;
      if (window.parent && window.parent !== window) return true;
    } catch (e) { return true; }
    return false;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }
  function maskNum(v) {
    if (!v) return '—';
    var s = String(v);
    if (s.length <= 2) return '••••';
    return '••••••';
  }
  function simpleHash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function hashPin(pin, salt, cb) {
    var s = salt + '|' + pin;
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
          var arr = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('00' + b.toString(16)).slice(-2); });
          cb(arr.join(''));
        }, function () { cb(simpleHash(s)); });
        return;
      }
    } catch (e) { /* fallback */ }
    cb(simpleHash(s));
  }

  /* ---------------- 保存 ---------------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      if (d.marks && typeof d.marks === 'object') state.marks = d.marks;
      if (Array.isArray(d.userDeals)) state.userDeals = d.userDeals;
      if (Array.isArray(d.trips)) state.trips = d.trips;
      if (Array.isArray(d.requests)) state.requests = d.requests;
      if (Array.isArray(d.quotes)) state.quotes = d.quotes;
      if (d.passport && typeof d.passport === 'object') state.passport = d.passport;
      if (d.payment && typeof d.payment === 'object') {
        state.payment = {
          cards: Array.isArray(d.payment.cards) ? d.payment.cards : [],
          defaultId: d.payment.defaultId || '',
          conv: Object.assign({ store: CONV_STORES[0], memo: '' }, d.payment.conv || {})
        };
      }
      if (d.lock && typeof d.lock === 'object') state.lock = { salt: d.lock.salt || '', hash: d.lock.hash || '' };
      if (Array.isArray(d.mileage)) state.mileage = d.mileage;
      if (d.prefs && typeof d.prefs === 'object') state.prefs = Object.assign(state.prefs, d.prefs);
      if (typeof d.filter === 'string') state.filter = d.filter;
      if (typeof d.filterKind === 'string') state.filterKind = d.filterKind;
      if (typeof d.tripKind === 'string') state.tripKind = d.tripKind;
      state.seeded = !!d.seeded;

      // 旧バージョンの単一カード設定を引き継ぐ
      if (!state.payment.cards.length && d.card && d.card.id) {
        var legacyName = (d.card.memo || '').trim() || 'カード';
        state.payment.cards.push({ id: uid('c'), name: legacyName, last4: '' });
        state.payment.defaultId = state.payment.cards[0].id;
      }
    } catch (e) { /* 壊れていても初期状態で動く */ }
  }
  function persist() {
    var payload = {
      marks: state.marks,
      userDeals: state.userDeals,
      trips: state.trips,
      requests: state.requests,
      quotes: state.quotes,
      passport: state.passport,
      payment: state.payment,
      mileage: state.mileage,
      prefs: state.prefs,
      lock: state.lock,
      filter: state.filter,
      filterKind: state.filterKind,
      tripKind: state.tripKind,
      seeded: state.seeded,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      toast('端末の保存領域がいっぱいで保存できませんでした（添付ファイルを小さくしてね）', true);
      return false;
    }
  }
  function markOf(id) {
    if (!state.marks[id]) state.marks[id] = { star: false, seen: false, status: '', memo: '' };
    return state.marks[id];
  }

  /* ---------------- データ結合 ---------------- */
  function applyPersonal(list) {
    if (!PERSONAL || !PERSONAL.notes) return list;
    list.forEach(function (d) {
      var n = PERSONAL.notes[d.id];
      if (n) d.note = n;
    });
    return list;
  }
  function initData() {
    var base = (Array.isArray(FEED.deals) ? FEED.deals : []).map(function (d) { return Object.assign({}, d); });
    var extra = (PERSONAL && Array.isArray(PERSONAL.deals) ? PERSONAL.deals : []).map(function (d) { return Object.assign({}, d); });
    feedDeals = applyPersonal(base.concat(extra));
    var seedTrips = (PERSONAL && Array.isArray(PERSONAL.trips) && PERSONAL.trips.length)
      ? PERSONAL.trips
      : (Array.isArray(FEED.trips) ? FEED.trips : []);
    feedTrips = seedTrips.map(function (t) { return Object.assign({}, t); });
    if (!state.seeded) {
      state.trips = seedTrips.map(function (t) { return Object.assign({}, t); });
      state.seeded = true;
      persist();
    }
  }

  function productOf(d) { return d.product || 'flight'; }
  function allDeals() {
    return feedDeals.concat(state.userDeals.map(function (d) {
      return Object.assign({ kind: 'sale', custom: true, tags: [], conditions: [], product: 'flight' }, d);
    }));
  }
  function newIds() { return Array.isArray(FEED.newIds) ? FEED.newIds : []; }
  function isNew(d) {
    if (newIds().indexOf(d.id) === -1) return false;
    var m = state.marks[d.id];
    return !(m && m.seen);
  }
  function dealStatus(d) {
    var now = Date.now();
    if (d.kind === 'fare') {
      var e0 = d.end ? Date.parse(d.end) : null;
      if (e0 && now > e0 + 86400000) return { k: 'ended', l: '終了' };
      return { k: 'fare', l: '候補' };
    }
    var s = d.start ? Date.parse(d.start) : null;
    var e = d.end ? Date.parse(d.end) : null;
    if (e && now > e) return { k: 'ended', l: '終了' };
    if (s && now < s) return { k: 'soon', l: 'まもなく' };
    return { k: 'live', l: '開催中' };
  }

  /* ---------------- ゲート（共有モード・PIN） ---------------- */
  function gateFor(target) {
    if (state.shareMode) return 'share';
    if ((target === 'trips' || target === 'settings') && state.lock.hash && !state.unlocked) return 'pin';
    return 'ok';
  }

  /* 共有モード・PINロック時に、個人情報を含むDOMを実体ごと空にする */
  function clearSensitiveDom() {
    ['cardList', 'mileageList', 'passStatus', 'tripList', 'tripKpi', 'quoteList', 'receiptPreview', 'quotePreview'].forEach(function (id) {
      var el = $(id);
      if (el) el.innerHTML = '';
    });
    ['passName', 'passNumber', 'passExpiry', 'passIssued', 'passCountry', 'convMemo', 'newCardName', 'newCardLast4'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    if ($('sheetBody')) $('sheetBody').innerHTML = '';
    if ($('printRoot')) $('printRoot').innerHTML = '';
  }

  function lockPanelHtml(g, where) {
    if (g === 'share') {
      return '' +
        '<div class="card">' +
          '<div class="banner danger" style="margin-bottom:10px"><span class="ic">🔒</span>' +
            '<div><b>共有モード中：' + (where === 'trips' ? '予約控え' : '個人情報の設定') + 'はロック中。</b>解除すると元どおり表示されます。</div></div>' +
          '<button class="btn-ghost" data-gate="share-off">🔓 共有モードを解除して表示する</button>' +
        '</div>';
    }
    return '' +
      '<div class="card">' +
        '<div class="banner warn" style="margin-bottom:10px"><span class="ic">🔐</span>' +
          '<div><b>4桁PINでロック中です。</b>予約・設定を開くにはPINを入力してください。</div></div>' +
        '<button class="btn-primary" data-gate="pin-open">PINを入力して開く</button>' +
      '</div>';
  }
  function bindLockPanel() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-gate]'), function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-gate');
        if (a === 'share-off') setShareMode(false);
        else openPinSheet('unlock');
      });
    });
  }

  /* ---------------- 共有モード ---------------- */
  function setShareMode(on) {
    state.shareMode = !!on;
    if (state.shareMode) {
      closeSheet();
      state.showPass = false;
      state.showMiles = false;
      state.revealed = {};
    }
    var btn = $('btnShare');
    btn.classList.toggle('on', state.shareMode);
    btn.setAttribute('aria-pressed', state.shareMode ? 'true' : 'false');
    btn.textContent = state.shareMode ? '🔓 共有モード解除' : '🔒 共有モード';
    $('shareBanner').classList.toggle('hidden', !state.shareMode);
    renderTrips();
    renderSettings();
    updatePreview();
    toast(state.shareMode ? '共有モードON：個人情報を隠しました' : '共有モードOFF：通常表示に戻しました');
  }

  /* ---------------- PIN ---------------- */
  function openPinSheet(mode) {
    var title = mode === 'unlock' ? 'PINを入力' : mode === 'change' ? 'PINを変更' : 'PINを解除';
    var body = '';
    if (mode === 'unlock') {
      body = '<div class="card">' +
        '<div class="field"><label for="pinIn">4桁のPIN</label>' +
        '<input type="password" id="pinIn" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></div>' +
        '<button class="btn-primary" id="pinGo">開く</button>' +
        '<p class="hint">PINはこの端末内にハッシュで保存されています。忘れた場合は端末のデータを消す必要があります。</p></div>';
    } else if (mode === 'change') {
      body = '<div class="card">' +
        '<div class="field"><label for="pinOld">現在のPIN</label><input type="password" id="pinOld" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
        '<div class="field"><label for="pinIn">新しいPIN（4桁）</label><input type="password" id="pinIn" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
        '<div class="field"><label for="pinIn2">新しいPIN（確認）</label><input type="password" id="pinIn2" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
        '<button class="btn-primary" id="pinGo">変更する</button></div>';
    } else {
      body = '<div class="card">' +
        '<div class="field"><label for="pinOld">現在のPIN</label><input type="password" id="pinOld" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
        '<button class="btn-primary alt" id="pinGo">PINロックを解除する</button>' +
        '<p class="hint">解除すると、予約・設定タブはPINなしで開けるようになります。</p></div>';
    }
    openSheet(title, body);
    $('pinGo').addEventListener('click', function () {
      var pin = ($('pinIn') ? $('pinIn').value : '').trim();
      var old = $('pinOld') ? $('pinOld').value.trim() : '';
      if (!/^\d{4}$/.test(pin)) { toast('4桁の数字で入れてね', true); return; }
      if (mode === 'unlock') {
        hashPin(pin, state.lock.salt, function (h) {
          if (h === state.lock.hash) {
            state.unlocked = true;
            closeSheet(); renderTrips(); renderSettings();
            toast('ロックを解除しました');
          } else toast('PINが違います', true);
        });
      } else if (mode === 'change') {
        var pin2 = $('pinIn2').value.trim();
        if (pin !== pin2) { toast('新しいPINが一致しません', true); return; }
        hashPin(old, state.lock.salt, function (h) {
          if (h !== state.lock.hash) { toast('現在のPINが違います', true); return; }
          var salt = String(Date.now()) + Math.random().toString(36).slice(2, 8);
          hashPin(pin, salt, function (h2) {
            state.lock = { salt: salt, hash: h2 };
            state.unlocked = true;
            persist(); closeSheet(); renderSettings();
            toast('PINを変更しました');
          });
        });
      } else {
        hashPin(old, state.lock.salt, function (h) {
          if (h !== state.lock.hash) { toast('PINが違います', true); return; }
          state.lock = { salt: '', hash: '' };
          state.unlocked = true;
          persist(); closeSheet(); renderSettings();
          toast('PINロックを解除しました');
        });
      }
    });
  }

  /* ---------------- タブ ---------------- */
  function switchTab(name) {
    state.activeTab = name;
    ['watch', 'trips', 'request', 'settings'].forEach(function (t) {
      var pane = $('pane-' + t);
      if (pane) pane.classList.toggle('hidden', t !== name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    window.scrollTo(0, 0);
    if (name === 'settings') renderSettings();
    if (name === 'trips') renderTrips();
    if (name === 'request') { renderRequests(); updatePreview(); }
    if (name === 'watch') { renderFilters(); renderDeals(); }
  }

  /* ============================================================
     タブ1：監視リスト
     ============================================================ */
  function renderPrefsStrip() {
    var p = state.prefs;
    var out = [];
    (p.airports || []).forEach(function (a) { out.push('<span class="pref-chip">' + esc(AIRPORT_LABEL[a] || a) + '発</span>'); });
    (p.areas || []).forEach(function (a) { out.push('<span class="pref-chip">' + esc(AREA_LABEL[a] || a) + '</span>'); });
    if (p.nights) out.push('<span class="pref-chip">' + esc(p.nights) + '</span>');
    if (p.time) out.push('<span class="pref-chip">' + esc(p.time) + '</span>');
    if (p.budget) out.push('<span class="pref-chip">予算 ' + esc(yen(p.budget)) + '</span>');
    var html;
    if (!out.length) {
      html = '<span class="pref-chip muted">希望条件は未設定 <button class="link-btn" id="prefsGo" style="padding:0 0 0 4px">設定する</button></span>';
    } else {
      html = out.join('') + '<button class="pref-chip muted" id="prefsGo">変更</button>';
    }
    $('prefsStrip').innerHTML = html;
    var go = $('prefsGo');
    if (go) go.addEventListener('click', function () { switchTab('settings'); });
  }

  function filteredDeals() {
    var list = allDeals();
    var f = state.filter, fk = state.filterKind;
    list = list.filter(function (d) {
      if (fk !== 'all' && productOf(d) !== fk) return false;
      var st = dealStatus(d).k;
      if (f === 'star') return !!(state.marks[d.id] && state.marks[d.id].star);
      if (f === 'live') return st === 'live' || st === 'soon';
      if (f === 'all') return true;
      return d.area === f;
    });
    var order = { live: 0, soon: 1, fare: 2, ended: 3 };
    return list.sort(function (a, b) {
      var sa = state.marks[a.id] && state.marks[a.id].star ? -1 : 0;
      var sb = state.marks[b.id] && state.marks[b.id].star ? -1 : 0;
      if (sa !== sb) return sa - sb;
      var oa = order[dealStatus(a).k], ob = order[dealStatus(b).k];
      if (oa !== ob) return oa - ob;
      return 0;
    });
  }

  function fitTags(d) {
    var out = [];
    var p = state.prefs;
    if (d.fitAirports && p.airports && p.airports.length) {
      var hit = d.fitAirports.filter(function (a) { return p.airports.indexOf(a) !== -1; });
      if (hit.length) out.push(hit.map(function (a) { return AIRPORT_LABEL[a] || a; }).join('/') + 'から狙える');
    }
    if (d.area && p.areas && p.areas.indexOf(d.area) !== -1) out.push('希望エリア');
    return out;
  }

  function renderKindRow() {
    var list = allDeals();
    var counts = { all: list.length, flight: 0, hotel: 0, package: 0 };
    list.forEach(function (d) { counts[productOf(d)] = (counts[productOf(d)] || 0) + 1; });
    $('kindRow').innerHTML = KIND_FILTERS.map(function (f) {
      return '<button class="chip' + (state.filterKind === f.k ? ' active' : '') + '" data-kind="' + f.k + '">' +
        esc(f.l) + '<span class="n">' + (counts[f.k] || 0) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('kindRow').querySelectorAll('[data-kind]'), function (b) {
      b.addEventListener('click', function () {
        state.filterKind = b.getAttribute('data-kind');
        persist(); renderKindRow(); renderDeals();
      });
    });
  }

  function renderFilters() {
    var list = allDeals();
    var counts = { all: list.length, live: 0, star: 0 };
    list.forEach(function (d) {
      var st = dealStatus(d).k;
      if (st === 'live' || st === 'soon') counts.live++;
      if (state.marks[d.id] && state.marks[d.id].star) counts.star++;
      counts[d.area] = (counts[d.area] || 0) + 1;
    });
    $('filterRow').innerHTML = FILTERS.map(function (f) {
      var n = counts[f.k] || 0;
      return '<button class="chip' + (state.filter === f.k ? ' active' : '') + '" data-filter="' + f.k + '">' +
        esc(f.l) + '<span class="n">' + n + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('filterRow').querySelectorAll('.chip'), function (b) {
      b.addEventListener('click', function () {
        state.filter = b.getAttribute('data-filter');
        persist(); renderFilters(); renderDeals();
      });
    });
    renderKindRow();
  }

  function renderDeals() {
    var list = filteredDeals();
    var box = $('dealList');
    if (!list.length) {
      box.innerHTML = '<div class="card empty"><span class="big">🌤️</span>この条件に合う監視はまだないよ。<br>「監視を自分で追加」から登録できる。<br><span style="font-size:11px">ホテルやパックも同じリストに追加できます。</span></div>';
      return;
    }
    box.innerHTML = list.map(function (d) {
      var st = dealStatus(d);
      var m = state.marks[d.id] || {};
      var tags = (d.tags || []).slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; });
      fitTags(d).forEach(function (t) { tags.unshift('<span class="tag fit">' + esc(t) + '</span>'); });
      if (m.status) tags.push('<span class="tag">' + esc(m.status) + '</span>');
      var prod = productOf(d);
      return '' +
        '<div class="deal' + (m.star ? ' starred' : '') + '" data-deal="' + esc(d.id) + '">' +
          (isNew(d) ? '<span class="new-flag">NEW</span>' : '') +
          '<div class="deal-top">' +
            '<span class="airline-badge" style="--bc:' + esc(d.color || '#334155') + '">' + esc(d.airline) + '</span>' +
            '<span class="pill ' + st.k + '">' + st.l + '</span>' +
            (prod !== 'flight' ? '<span class="pill ' + prod + '">' + (prod === 'hotel' ? '🛏 ホテル' : '🧳 パック') + '</span>' : '') +
            (d.custom ? '<span class="pill ended">手動</span>' : '') +
          '</div>' +
          '<div class="deal-title">' + esc(d.title) + '</div>' +
          (d.priceMain ? '<div class="deal-price">' + esc(d.priceMain) + '</div>' : '') +
          (d.priceSub ? '<div class="deal-price-sub">' + esc(d.priceSub) + '</div>' : '') +
          '<div class="deal-meta">' + esc(periodText(d)) + '</div>' +
          (tags.length ? '<div class="tagrow">' + tags.join('') + '</div>' : '') +
          '<div class="deal-foot">' +
            '<button class="star-btn' + (m.star ? ' on' : '') + '" data-star="' + esc(d.id) + '" aria-label="ウォッチ">' + (m.star ? '★' : '☆') + '</button>' +
            '<button class="detail-btn" data-deal="' + esc(d.id) + '">詳細と予約ページ →</button>' +
          '</div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(box.querySelectorAll('[data-star]'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = b.getAttribute('data-star');
        var m = markOf(id);
        m.star = !m.star;
        persist();
        renderDeals(); renderFilters();
        updateNewDot();
        toast(m.star ? '★ ウォッチに入れたよ' : '★ を外したよ');
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('.detail-btn[data-deal]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openDeal(b.getAttribute('data-deal')); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('.deal[data-deal]'), function (b) {
      b.addEventListener('click', function () { openDeal(b.getAttribute('data-deal')); });
    });
  }

  function periodText(d) {
    var bits = [];
    if (d.kind === 'fare') {
      bits.push('搭乗・宿泊開始 ' + fmtDate(d.start, false));
    } else if (d.start && d.end) {
      bits.push(fmtDate(d.start, false) + ' 〜 ' + fmtDate(d.end, false));
    } else if (d.end) {
      bits.push('〜' + fmtDate(d.end, false) + 'まで');
    }
    if (d.travel) bits.push(d.travel);
    return bits.join(' ／ ');
  }

  function updateNewDot() {
    var n = allDeals().filter(isNew).length;
    var dot = $('dotWatch');
    if (!dot) return;
    dot.textContent = String(n);
    dot.classList.toggle('hidden', n === 0);
  }

  function renderQuickLinks() {
    var links = [
      { l: '関空→台北', u: 'https://www.skyscanner.jp/transport/flights/kix/tpe/' },
      { l: '関空→ソウル', u: 'https://www.skyscanner.jp/transport/flights/kix/sel/' },
      { l: '関空→ヨーロッパ', u: 'https://www.skyscanner.jp/transport/flights/kix/ams/' },
      { l: '羽田→伊丹', u: 'https://www.skyscanner.jp/transport/flights/hnd/itm/' },
      { l: 'Trip.com', u: 'https://jp.trip.com/flights/' },
      { l: '台湾高鉄', u: 'https://www.thsrc.com.tw/' }
    ];
    $('quickLinks').innerHTML = links.map(function (x) {
      return '<a class="mini-btn" href="' + x.u + '" target="_blank" rel="noopener">' + esc(x.l) + '</a>';
    }).join('');
    var g = $('quickLinks');
    g.style.display = 'grid';
    g.style.gridTemplateColumns = '1fr 1fr 1fr';
    g.style.gap = '6px';
  }

  /* ---------------- 便の詳細シート ---------------- */
  function compareUrl(d) {
    var f = (d.fitAirports && d.fitAirports[0]) || 'kix';
    var map = { taiwan: 'tpe', asia: 'sel', europe: 'ams', domestic: 'itm', other: 'tpe' };
    var to = map[d.area] || 'tpe';
    if (f === 'HND' || f === 'NRT') {
      var from = f.toLowerCase();
      return 'https://www.skyscanner.jp/transport/flights/' + from + '/' + (d.area === 'domestic' ? 'itm' : to) + '/';
    }
    return 'https://www.skyscanner.jp/transport/flights/kix/' + to + '/';
  }

  function openDeal(id) {
    var d = allDeals().filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var m = markOf(id);
    m.seen = true;
    persist();
    var st = dealStatus(d);
    var rows = [];
    var span = '';
    if (d.kind === 'fare') span = '開始日 ' + fmtDate(d.start, true);
    else if (d.start && d.end) span = fmtDate(d.start, true) + ' 〜 ' + fmtDate(d.end, false);
    else if (d.end) span = '〜' + fmtDate(d.end, true) + 'まで';
    rows.push('<div class="row"><div class="k">期間</div><div class="v">' + esc(span || '—') + '</div></div>');
    if (d.travel) rows.push('<div class="row"><div class="k">対象</div><div class="v">' + esc(d.travel) + '</div></div>');
    if (d.priceSub) rows.push('<div class="row"><div class="k">運賃目安</div><div class="v">' + esc(d.priceSub) + '</div></div>');
    rows.push('<div class="row"><div class="k">種別</div><div class="v">' + esc(PRODUCT_LABEL[productOf(d)]) + '</div></div>');
    if (d.area && d.area !== 'other') rows.push('<div class="row"><div class="k">エリア</div><div class="v">' + esc(AREA_LABEL[d.area] || d.area) + '</div></div>');
    var conds = (d.conditions || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    var html = '' +
      '<div class="card">' +
        '<div class="deal-top">' +
          '<span class="airline-badge" style="--bc:' + esc(d.color || '#334155') + '">' + esc(d.airline) + '</span>' +
          '<span class="pill ' + st.k + '">' + st.l + '</span>' +
        '</div>' +
        '<div class="deal-title" style="margin-top:6px">' + esc(d.title) + '</div>' +
        (d.priceMain ? '<div class="deal-price">' + esc(d.priceMain) + '</div>' : '') +
        (d.priceSub ? '<div class="deal-price-sub">' + esc(d.priceSub) + '</div>' : '') +
        '<div style="margin-top:8px">' + rows.join('') + '</div>' +
        (d.code ? '<div class="code-box"><code>' + esc(d.code) + '</code><button class="mini-btn" id="sheetCopyCode">コピー</button></div>' +
          (d.codeNote ? '<p class="hint">' + esc(d.codeNote) + '</p>' : '') : '') +
        (conds ? '<div style="margin-top:10px"><div class="flabel">条件・注意点</div><ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6">' + conds + '</ul></div>' : '') +
        (d.note ? '<div class="banner info" style="margin:12px 0 0"><span class="ic">💡</span><div>' + esc(d.note) + '</div></div>' : '') +
        '<button class="btn-ghost" id="sheetQuote" style="margin-top:12px">📄 この案件で見積書を発行</button>' +
        (d.url ? '<a class="btn-primary" style="margin-top:8px;text-align:center;text-decoration:none" href="' + esc(d.url) + '" target="_blank" rel="noopener">✈️ 公式サイトで予約・決済へ進む →</a>' +
          '<div class="hint" style="text-align:center">' + esc(d.urlLabel || '') + '</div>' : '') +
        '<a class="btn-ghost" style="margin-top:8px;text-align:center;text-decoration:none;line-height:1.6" href="' + esc(compareUrl(d)) + '" target="_blank" rel="noopener">🔎 比較サイトで最安を見る（Skyscanner）</a>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><span>自分のメモ・状態</span></div>' +
        '<div class="field">' +
          '<label for="dealMemo">メモ</label>' +
          '<textarea id="dealMemo" placeholder="例：11/20 12:00に開始。2泊3日で関空17:00台の復路を狙う">' + esc(m.memo || '') + '</textarea>' +
        '</div>' +
        '<div class="field" style="margin-bottom:10px">' +
          '<span class="flabel">状態</span>' +
          '<div class="filter-row" style="margin-bottom:0">' +
            ['', '検討中', '予約した', '見送り'].map(function (s) {
              var lab = s === '' ? 'なし' : s;
              return '<button class="chip' + ((m.status || '') === s ? ' active' : '') + '" data-status="' + esc(s) + '">' + esc(lab) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="btn-row">' +
          '<button class="mini-btn' + (m.star ? ' accent' : '') + '" id="sheetStar">' + (m.star ? '★ ウォッチ中' : '☆ ウォッチする') + '</button>' +
          (d.custom ? '<button class="mini-btn danger" id="sheetDelete">削除</button>' : '') +
        '</div>' +
        '<button class="btn-primary" id="sheetSaveMemo" style="margin-top:10px">メモを保存</button>' +
      '</div>';

    openSheet(d.airline || 'セール詳細', html);

    var copyCode = $('sheetCopyCode');
    if (copyCode) copyCode.addEventListener('click', function () {
      copyText(d.code).then(function () { toast('コード「' + d.code + '」をコピーしました'); },
        function () { toast('コピーできませんでした', true); });
    });
    $('sheetQuote').addEventListener('click', function () {
      openQuote({ type: 'deal', deal: d });
    });
    Array.prototype.forEach.call($('sheetBody').querySelectorAll('[data-status]'), function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-status');
        markOf(id).status = s;
        persist();
        Array.prototype.forEach.call($('sheetBody').querySelectorAll('[data-status]'), function (x) {
          x.classList.toggle('active', x === b);
        });
        renderDeals();
      });
    });
    $('sheetStar').addEventListener('click', function () {
      var mk = markOf(id);
      mk.star = !mk.star;
      persist();
      this.textContent = mk.star ? '★ ウォッチ中' : '☆ ウォッチする';
      this.classList.toggle('accent', mk.star);
      renderDeals(); renderFilters(); updateNewDot();
    });
    var del = $('sheetDelete');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('この監視を削除しますか？')) return;
      state.userDeals = state.userDeals.filter(function (x) { return x.id !== id; });
      delete state.marks[id];
      persist(); closeSheet(); renderDeals(); renderFilters(); updateNewDot();
      toast('削除しました');
    });
    $('sheetSaveMemo').addEventListener('click', function () {
      markOf(id).memo = $('dealMemo').value;
      persist();
      toast('メモを保存しました');
      closeSheet();
    });
    updateNewDot();
  }

  function openDealForm() {
    var html = '' +
      '<div class="card">' +
        '<div class="field"><span class="flabel">種別</span>' +
          '<div class="seg three" id="ndKindSeg">' +
            '<label><input type="radio" name="ndKind" value="flight" checked><span>✈️ 航空券</span></label>' +
            '<label><input type="radio" name="ndKind" value="hotel"><span>🛏 ホテル</span></label>' +
            '<label><input type="radio" name="ndKind" value="package"><span>🧳 パック</span></label>' +
          '</div></div>' +
        '<div class="field"><label for="ndAirline">航空会社・ホテル・サイト名</label><input type="text" id="ndAirline" placeholder="例：東横イン／ジェットスター"></div>' +
        '<div class="field"><label for="ndTitle">内容</label><input type="text" id="ndTitle" placeholder="例：関空→台北 片道7,980円／大阪 シングル6,800円"></div>' +
        '<div class="field"><label for="ndArea">エリア</label><select id="ndArea">' +
          '<option value="taiwan">台湾・香港</option><option value="asia">韓国・アジア</option>' +
          '<option value="europe">ヨーロッパ</option><option value="domestic">国内線</option><option value="other">その他</option></select></div>' +
        '<div class="two-col">' +
          '<div class="field"><label for="ndStart">開始日</label><input type="date" id="ndStart"></div>' +
          '<div class="field"><label for="ndEnd">終了日</label><input type="date" id="ndEnd"></div>' +
        '</div>' +
        '<div class="field"><label for="ndPrice">価格メモ</label><input type="text" id="ndPrice" placeholder="例：片道8,696円〜"></div>' +
        '<div class="field"><label for="ndUrl">予約ページURL <span class="opt">（任意）</span></label><input type="text" id="ndUrl" placeholder="https://" inputmode="url"></div>' +
        '<div class="field"><label for="ndMemo">自分用メモ <span class="opt">（任意）</span></label><textarea id="ndMemo" placeholder="条件・見つけた場所など"></textarea></div>' +
        '<div class="field"><label for="ndTags">タグ <span class="opt">（カンマ区切り・任意）</span></label><input type="text" id="ndTags" placeholder="台湾, 関空発, ホテル"></div>' +
        '<button class="btn-primary" id="ndSave">保存する</button>' +
      '</div>';
    openSheet('監視を追加', html);
    $('ndSave').addEventListener('click', function () {
      var airline = $('ndAirline').value.trim();
      var title = $('ndTitle').value.trim();
      if (!title) { toast('内容を入れてね', true); return; }
      var sd = $('ndStart').value, ed = $('ndEnd').value;
      var url = $('ndUrl').value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      var tags = $('ndTags').value.split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var kindEl = document.querySelector('input[name="ndKind"]:checked');
      var deal = {
        id: uid('u'),
        airline: airline || '手動メモ',
        title: title,
        kind: 'sale',
        product: kindEl ? kindEl.value : 'flight',
        area: $('ndArea').value,
        start: sd ? sd + 'T00:00:00' : '',
        end: ed ? ed + 'T23:59:00' : '',
        priceMain: $('ndPrice').value.trim(),
        priceSub: '',
        tags: tags,
        conditions: [],
        url: url,
        urlLabel: '予約ページ',
        note: '',
        custom: true
      };
      var memo = $('ndMemo').value.trim();
      state.userDeals.unshift(deal);
      if (memo) markOf(deal.id).memo = memo;
      markOf(deal.id).seen = true;
      persist();
      closeSheet();
      renderDeals(); renderFilters();
      toast('監視に追加しました');
      signal('フライトウォッチに「' + title + '」を追加しました（' + PRODUCT_LABEL[deal.product] + '）。');
    });
  }

  /* ============================================================
     タブ2：予約済み＆予定
     ============================================================ */
  function tripKindOf(t) {
    if (t.kind) return t.kind;
    return (t.hotel && t.hotel.name) ? 'package' : 'flight';
  }
  function sortedTrips() {
    return state.trips.slice().sort(function (a, b) {
      return String(tripDate(a)).localeCompare(String(tripDate(b)));
    });
  }
  function tripDate(t) {
    if (t.kind === 'hotel' && t.hotel && t.hotel.checkIn) return t.hotel.checkIn;
    return t.date || '';
  }
  function routeName(v) {
    var m = /^([A-Z]{3})\s+(.+)$/.exec(v || '');
    return m ? m[2] : (v || '—');
  }
  function routeCode(v) {
    var m = /^([A-Z]{3})\s+(.+)$/.exec(v || '');
    return m ? m[1] : '';
  }
  function tripTitle(t) {
    var k = tripKindOf(t);
    if (k === 'hotel') return (t.hotel && (t.hotel.name || t.hotel.area)) || 'ホテル';
    if (k === 'package') return esc(routeName(t.from)) + ' → ' + esc(routeName(t.to)) + ' ＋ ' + esc((t.hotel && (t.hotel.name || 'ホテル')) || 'ホテル');
    return esc(routeName(t.from)) + ' → ' + esc(routeName(t.to));
  }
  function tripNights(t) {
    var h = t.hotel || {};
    if (!h.checkIn || !h.checkOut) return null;
    var n = dayDiff(h.checkIn, h.checkOut);
    return (n == null || n < 0) ? null : n;
  }

  function expenseBadge(t) {
    if (t.expense === 'business') {
      return t.reflected
        ? '<span class="pill exp">経費・反映済み</span>'
        : '<span class="pill exp-pending">経費・未反映</span>';
    }
    if (t.expense === 'private') return '<span class="pill exp-off">対象外（プライベート）</span>';
    return '<span class="pill exp-off">経費：未設定</span>';
  }

  function renderTripKindRow() {
    var counts = { all: state.trips.length, flight: 0, hotel: 0, package: 0 };
    state.trips.forEach(function (t) { counts[tripKindOf(t)] = (counts[tripKindOf(t)] || 0) + 1; });
    $('tripKindRow').innerHTML = KIND_FILTERS.map(function (f) {
      return '<button class="chip' + (state.tripKind === f.k ? ' active' : '') + '" data-tkind="' + f.k + '">' +
        esc(f.l) + '<span class="n">' + (counts[f.k] || 0) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('tripKindRow').querySelectorAll('[data-tkind]'), function (b) {
      b.addEventListener('click', function () {
        state.tripKind = b.getAttribute('data-tkind');
        persist(); renderTrips();
      });
    });
  }

  function renderTrips() {
    var g = gateFor('trips');
    var locked = g !== 'ok';
    $('tripsLocked').classList.toggle('hidden', !locked);
    $('tripsBody').classList.toggle('hidden', locked);
    if (locked) {
      $('tripsLocked').innerHTML = lockPanelHtml(g, 'trips');
      clearSensitiveDom();
      bindLockPanel();
      return;
    }

    renderTripKindRow();
    var list = sortedTrips().filter(function (t) {
      return state.tripKind === 'all' || tripKindOf(t) === state.tripKind;
    });
    var today = todayISO();

    var upcoming = list.filter(function (t) { return (tripDate(t) || '') >= today; });
    var next = upcoming[0];
    var biz = list.filter(function (t) { return t.expense === 'business'; });
    var bizTotal = biz.reduce(function (s, t) { return s + (Number(t.price) || 0); }, 0);

    $('tripKpi').innerHTML =
      '<div class="kpi"><div class="kpi-label">これからの予定</div><div class="kpi-value">' + upcoming.length + '<small>件</small></div>' +
        (next ? '<div class="kpi-label" style="margin-top:4px">次は ' + esc(fmtDate(tripDate(next), true)) + '</div>' : '') + '</div>' +
      '<div class="kpi"><div class="kpi-label">経費（確定申告）</div><div class="kpi-value">' + yen(bizTotal) + '</div>' +
        '<div class="kpi-label" style="margin-top:4px">' + biz.length + '件・旅費交通費</div></div>';

    if (!list.length) {
      $('tripList').innerHTML = '<div class="card empty"><span class="big">🎫</span>まだ予約メモがないよ。<br>「＋ 追加」から航空券・ホテル・パックの控えを残せる。</div>';
      renderQuotes();
      return;
    }

    $('tripList').innerHTML = list.map(function (t) {
      var kind = tripKindOf(t);
      var past = (tripDate(t) || '') < today;
      var stat = t.status === 'booked' ? '<span class="pill live">予約済み</span>' :
        (t.status === 'done' ? '<span class="pill ended">搭乗済み' + (kind === 'hotel' ? '（宿泊済み）' : '') + '</span>' : '<span class="pill soon">計画中</span>');
      var refKey = 'ref:' + t.id;
      var refShown = state.revealed[refKey];
      var line = '';
      if (kind !== 'hotel') {
        line = '✈️ ' + esc(t.flight || '便名未定') +
          (routeCode(t.from) ? '　' + esc(routeCode(t.from) + '→' + routeCode(t.to)) : '') +
          (t.depTime ? '　' + esc(t.depTime) + (t.arrTime ? ' → ' + esc(t.arrTime) : '') : '');
      }
      var nights = tripNights(t);
      var hName = (t.hotel && (t.hotel.name || t.hotel.area)) || '';
      var hotelLine = (kind !== 'flight' && (hName || (t.hotel && t.hotel.checkIn)))
        ? '🛏 ' + (kind === 'package' && hName ? esc(hName) + '　' : '') +
          (t.hotel.checkIn ? esc(fmtDate(t.hotel.checkIn, false)) + '〜' + esc(fmtDate(t.hotel.checkOut, false)) : '') +
          (nights != null ? '（' + nights + '泊）' : '') +
          (t.hotel.room ? '　' + esc(t.hotel.room) : '')
        : '';
      var quoteTag = t.quoteNo ? '<span class="tag">見積 ' + esc(t.quoteNo) + '</span>' : '';
      var receiptTag = t.receipt && (t.receipt.amount || t.receipt.issuer) ? '<span class="tag fit">🧾 領収書あり</span>' : '';
      return '' +
        '<div class="trip ' + kind + (t.status === 'booked' ? '' : ' planning') + (past ? ' past' : '') + '" data-trip="' + esc(t.id) + '">' +
          '<div class="trip-top">' +
            '<span class="trip-date">' + esc(fmtDate(tripDate(t), true)) + '</span>' +
            '<span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">' +
              (kind === 'hotel' ? '<span class="pill hotel">ホテル</span>' : kind === 'package' ? '<span class="pill package">パック</span>' : '') +
              stat + expenseBadge(t) + '</span>' +
          '</div>' +
          '<div class="trip-route">' + tripTitle(t) + '</div>' +
          (line ? '<div class="trip-flight">' + line + (Number(t.price) ? '　' + esc(yen(t.price)) : '') + '</div>' : '') +
          (hotelLine ? '<div class="trip-flight">' + hotelLine + (kind === 'hotel' && Number(t.price) ? '　' + esc(yen(t.price)) : '') + '</div>' : '') +
          (t.ref ? '<div class="trip-ref">予約番号 <b class="' + (refShown ? '' : 'masked') + '">' + esc(refShown ? t.ref : '••••••') + '</b> ' +
            '<button class="mini-btn" data-reveal="' + esc(refKey) + '" style="min-height:26px;padding:2px 8px">' + (refShown ? '隠す' : '👁 表示') + '</button></div>' : '') +
          '<div class="trip-tags">' + quoteTag + receiptTag +
            (t.memo ? '<span class="tag" style="white-space:normal">' + esc(t.memo.length > 60 ? t.memo.slice(0, 60) + '…' : t.memo) + '</span>' : '') + '</div>' +
          '<div class="trip-actions">' +
            '<button class="mini-btn accent" data-receipt="' + esc(t.id) + '">🧾 領収書を見る</button>' +
            '<button class="mini-btn" data-tripquote="' + esc(t.id) + '">📄 見積書</button>' +
            '<button class="mini-btn" data-trippedit="' + esc(t.id) + '">編集</button>' +
          '</div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call($('tripList').querySelectorAll('[data-trippedit]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openTripForm(b.getAttribute('data-trippedit')); });
    });
    Array.prototype.forEach.call($('tripList').querySelectorAll('.trip[data-trip]'), function (b) {
      b.addEventListener('click', function () { openTripForm(b.getAttribute('data-trip')); });
    });
    Array.prototype.forEach.call($('tripList').querySelectorAll('[data-receipt]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openReceipt(b.getAttribute('data-receipt')); });
    });
    Array.prototype.forEach.call($('tripList').querySelectorAll('[data-tripquote]'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var t = state.trips.filter(function (x) { return x.id === b.getAttribute('data-tripquote'); })[0];
        if (t) openQuote({ type: 'trip', trip: t });
      });
    });
    Array.prototype.forEach.call($('tripList').querySelectorAll('[data-reveal]'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var k = b.getAttribute('data-reveal');
        state.revealed[k] = !state.revealed[k];
        renderTrips();
      });
    });
    renderQuotes();
  }

  function openTripForm(id) {
    var t = id ? state.trips.filter(function (x) { return x.id === id; })[0] : null;
    var isNewTrip = !t;
    t = t || {
      id: uid('t'), kind: 'flight', date: '', flight: '', from: '', to: '', depTime: '', arrTime: '',
      status: 'booked', price: '', ref: '', expense: 'private', reflected: false, memo: '', intl: false,
      hotel: { name: '', area: '', checkIn: '', checkOut: '', room: '', guests: '1', cancel: '' },
      receipt: null, quoteNo: ''
    };
    var kind = tripKindOf(t);
    var h = t.hotel || {};

    var html = '' +
      '<div class="card">' +
        '<div class="field"><span class="flabel">種別</span>' +
          '<div class="seg three" id="tfKindSeg">' +
            '<label><input type="radio" name="tfKind" value="flight"' + (kind === 'flight' ? ' checked' : '') + '><span>✈️ 航空券</span></label>' +
            '<label><input type="radio" name="tfKind" value="hotel"' + (kind === 'hotel' ? ' checked' : '') + '><span>🛏 ホテル</span></label>' +
            '<label><input type="radio" name="tfKind" value="package"' + (kind === 'package' ? ' checked' : '') + '><span>🧳 パック</span></label>' +
          '</div></div>' +
        '<div class="two-col">' +
          '<div class="field"><label for="tfDate">日付（出発／チェックイン）</label><input type="date" id="tfDate" value="' + esc(tripDate(t)) + '"></div>' +
          '<div class="field"><label for="tfStatus">状態</label><select id="tfStatus">' +
            '<option value="booked"' + (t.status === 'booked' ? ' selected' : '') + '>予約済み</option>' +
            '<option value="planning"' + (t.status === 'planning' ? ' selected' : '') + '>計画中</option>' +
            '<option value="done"' + (t.status === 'done' ? ' selected' : '') + '>搭乗／宿泊済み</option>' +
          '</select></div>' +
        '</div>' +

        '<div id="tfFlightBlock">' +
          '<div class="field"><label for="tfFlight">便名</label><input type="text" id="tfFlight" value="' + esc(t.flight) + '" placeholder="例：JAL116"></div>' +
          '<div class="two-col">' +
            '<div class="field"><label for="tfFrom">出発</label><input type="text" id="tfFrom" value="' + esc(t.from) + '" placeholder="伊丹"></div>' +
            '<div class="field"><label for="tfTo">到着</label><input type="text" id="tfTo" value="' + esc(t.to) + '" placeholder="羽田"></div>' +
          '</div>' +
          '<div class="two-col">' +
            '<div class="field"><label for="tfDep">出発時刻</label><input type="text" id="tfDep" value="' + esc(t.depTime) + '" placeholder="12:30" inputmode="numeric"></div>' +
            '<div class="field"><label for="tfArr">到着時刻</label><input type="text" id="tfArr" value="' + esc(t.arrTime) + '" placeholder="13:40" inputmode="numeric"></div>' +
          '</div>' +
        '</div>' +

        '<div id="tfHotelBlock">' +
          '<div class="field"><label for="tfHotelName">ホテル名</label><input type="text" id="tfHotelName" value="' + esc(h.name || '') + '" placeholder="例：東横イン 大阪天王寺"></div>' +
          '<div class="field"><label for="tfHotelArea">エリア</label><input type="text" id="tfHotelArea" value="' + esc(h.area || '') + '" placeholder="例：天王寺"></div>' +
          '<div class="two-col">' +
            '<div class="field"><label for="tfCheckIn">チェックイン</label><input type="date" id="tfCheckIn" value="' + esc(h.checkIn || '') + '"></div>' +
            '<div class="field"><label for="tfCheckOut">チェックアウト</label><input type="date" id="tfCheckOut" value="' + esc(h.checkOut || '') + '"></div>' +
          '</div>' +
          '<div class="two-col">' +
            '<div class="field"><label for="tfRoom">部屋・人数</label><input type="text" id="tfRoom" value="' + esc(h.room || '') + '" placeholder="シングル1名"></div>' +
            '<div class="field"><label for="tfCancel">キャンセル規定</label><input type="text" id="tfCancel" value="' + esc(h.cancel || '') + '" placeholder="前日まで無料"></div>' +
          '</div>' +
        '</div>' +

        '<div class="two-col">' +
          '<div class="field"><label for="tfPrice">金額（円）</label><input type="number" id="tfPrice" value="' + esc(t.price || '') + '" inputmode="numeric" step="10"></div>' +
          '<div class="field"><label for="tfRef">予約番号</label><input type="text" id="tfRef" value="' + esc(t.ref) + '" placeholder="例：ABC123" autocomplete="off"></div>' +
        '</div>' +
        '<div class="field">' +
          '<span class="flabel">確定申告の扱い</span>' +
          '<div class="seg" id="tfExpenseSeg">' +
            '<label><input type="radio" name="tfExpense" value="private"' + (t.expense !== 'business' ? ' checked' : '') + '><span>プライベート（対象外）</span></label>' +
            '<label><input type="radio" name="tfExpense" value="business"' + (t.expense === 'business' ? ' checked' : '') + '><span>事業経費（旅費交通費）</span></label>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<div class="check-row"><input type="checkbox" id="tfIntl"' + (t.intl ? ' checked' : '') + '>' +
            '<div><div class="ct">海外（パスポートが必要）</div><div class="cs">チェックすると、この渡航日でパスポートの残存期間を判定します。</div></div></div>' +
        '</div>' +
        '<div class="field">' +
          '<div class="check-row"><input type="checkbox" id="tfReflected"' + (t.reflected ? ' checked' : '') + '>' +
            '<div><div class="ct">帳簿（経費）に反映済み</div><div class="cs">会計に入れたらチェック。バッジが「反映済み」に変わります。</div></div></div>' +
        '</div>' +
        '<div class="field"><label for="tfMemo">メモ</label><textarea id="tfMemo" placeholder="座席・支払いカード・乗継など">' + esc(t.memo) + '</textarea></div>' +
        '<button class="btn-primary" id="tfSave">' + (isNewTrip ? '追加する' : '保存する') + '</button>' +
        (isNewTrip ? '' : '<button class="btn-ghost" id="tfReceipt" style="margin-top:8px">🧾 領収書を見る／登録</button>') +
        (isNewTrip ? '' : '<button class="btn-ghost" id="tfDelete" style="margin-top:8px;color:var(--danger)">この控えを削除</button>') +
      '</div>';

    openSheet(isNewTrip ? '予約・ホテルを追加' : '予約・ホテルを編集', html);

    function syncBlocks() {
      var k = (document.querySelector('input[name="tfKind"]:checked') || {}).value || 'flight';
      $('tfFlightBlock').classList.toggle('hidden', k === 'hotel');
      $('tfHotelBlock').classList.toggle('hidden', k === 'flight');
    }
    syncBlocks();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="tfKind"]'), function (r) {
      r.addEventListener('change', syncBlocks);
    });

    $('tfSave').addEventListener('click', function () {
      var k = (document.querySelector('input[name="tfKind"]:checked') || {}).value || 'flight';
      var date = $('tfDate').value;
      var checkIn = $('tfCheckIn').value, checkOut = $('tfCheckOut').value;
      if (!date && !checkIn) { toast('日付を入れてね', true); return; }
      var expEl = document.querySelector('input[name="tfExpense"]:checked');
      var obj = Object.assign({}, t, {
        kind: k,
        date: date || checkIn,
        flight: $('tfFlight').value.trim(),
        from: $('tfFrom').value.trim(),
        to: $('tfTo').value.trim(),
        depTime: $('tfDep').value.trim(),
        arrTime: $('tfArr').value.trim(),
        status: $('tfStatus').value,
        price: Number($('tfPrice').value) || 0,
        ref: $('tfRef').value.trim(),
        expense: expEl ? expEl.value : 'private',
        reflected: $('tfReflected').checked,
        intl: $('tfIntl').checked,
        hotel: {
          name: $('tfHotelName').value.trim(),
          area: $('tfHotelArea').value.trim(),
          checkIn: checkIn,
          checkOut: checkOut,
          room: $('tfRoom').value.trim(),
          cancel: $('tfCancel').value.trim()
        },
        memo: $('tfMemo').value.trim()
      });
      var idx = -1;
      state.trips.forEach(function (x, i) { if (x.id === obj.id) idx = i; });
      if (idx >= 0) state.trips[idx] = obj; else state.trips.push(obj);
      persist(); closeSheet(); renderTrips();
      toast(isNewTrip ? '追加しました' : '保存しました');
      if (!isNewTrip) return;
      signal('予約メモを追加しました：' + PRODUCT_LABEL[k] + '／' + (obj.date || '') + ' ' +
        (k === 'hotel' ? ((obj.hotel && obj.hotel.name) || 'ホテル') : (obj.flight || '便名未定') + ' ' + obj.from + '→' + obj.to) +
        (obj.price ? ' ' + yen(obj.price) : '') + '（' + (obj.expense === 'business' ? '経費' : 'プライベート') + '）');
    });
    var del = $('tfDelete');
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('この控えを削除しますか？')) return;
      state.trips = state.trips.filter(function (x) { return x.id !== t.id; });
      persist(); closeSheet(); renderTrips(); toast('削除しました');
    });
    var rb = $('tfReceipt');
    if (rb) rb.addEventListener('click', function () { openReceipt(t.id); });
  }

  function copyExpenses() {
    var biz = sortedTrips().filter(function (t) { return t.expense === 'business'; });
    if (!biz.length) { toast('経費にした予約がまだないよ', true); return; }
    var lines = biz.map(function (t) {
      var label = tripKindOf(t) === 'hotel' ? ((t.hotel && t.hotel.name) || '宿泊') : (t.flight || '') + ' ' + (t.from || '') + '→' + (t.to || '');
      return [tripDate(t), '旅費交通費', Number(t.price) || 0,
        label + (t.ref ? '（' + t.ref + '）' : '') + (t.receipt && t.receipt.issuer ? ' / 領収書:' + t.receipt.issuer : '')]
        .join('\t');
    });
    copyText(lines.join('\n')).then(function () {
      toast('経費' + biz.length + '件をコピーしました');
      signal('経費分' + biz.length + '件（合計' + yen(biz.reduce(function (s, t) { return s + (Number(t.price) || 0); }, 0)) + '）を会計用にコピーしました。');
    }, function () { toast('コピーできませんでした', true); });
  }

  /* ============================================================
     領収書
     ============================================================ */
  function receiptOf(t) {
    if (!t.receipt) return {};
    return t.receipt;
  }
  function openReceipt(tripId) {
    if (state.shareMode) { toast('共有モード中は領収書を表示できません', true); return; }
    var t = state.trips.filter(function (x) { return x.id === tripId; })[0];
    if (!t) return;
    var r = receiptOf(t);
    var k = tripKindOf(t);
    var issuerDefault = k === 'hotel' ? ((t.hotel && t.hotel.name) || '') :
      (k === 'package' ? ((t.hotel && t.hotel.name) || '') : (t.flight || ''));
    var nameDefault = state.passport && state.passport.name ? state.passport.name : '';
    var payDefault = defaultPayText();
    var doc = {
      no: r.no || ('RCP-' + (tripDate(t) || todayISO()).replace(/-/g, '') + '-' + String(100 + Math.floor(Math.random() * 900))),
      issuer: r.issuer || issuerDefault,
      addressee: r.addressee || nameDefault,
      date: r.date || tripDate(t) || todayISO(),
      amount: r.amount != null && r.amount !== '' ? Number(r.amount) : (Number(t.price) || 0),
      purpose: r.purpose || '旅費交通費として',
      method: r.method || payDefault,
      url: r.url || '',
      memo: r.memo || '',
      attachment: r.attachment || null
    };

    var html = '' +
      '<div class="card">' +
        '<div id="receiptPreview"></div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="mini-btn accent" id="rcPrint">🖨 印刷／PDF保存</button>' +
          '<button class="mini-btn" id="rcCopy">📋 テキストでコピー</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><span>領収書の内容</span></div>' +
        '<div class="two-col">' +
          '<div class="field"><label for="rcIssuer">発行元</label><input type="text" id="rcIssuer" value="' + esc(doc.issuer) + '" placeholder="航空会社・ホテル名"></div>' +
          '<div class="field"><label for="rcNo">領収書番号</label><input type="text" id="rcNo" value="' + esc(doc.no) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="rcTo">宛名</label><input type="text" id="rcTo" value="' + esc(doc.addressee) + '" placeholder="空欄なら「様」"></div>' +
        '<div class="two-col">' +
          '<div class="field"><label for="rcDate">発行日</label><input type="date" id="rcDate" value="' + esc(doc.date) + '"></div>' +
          '<div class="field"><label for="rcAmount">金額（円）</label><input type="number" id="rcAmount" value="' + esc(doc.amount) + '" inputmode="numeric" step="10"></div>' +
        '</div>' +
        '<div class="field"><label for="rcPurpose">但し書き</label><input type="text" id="rcPurpose" value="' + esc(doc.purpose) + '"></div>' +
        '<div class="field"><label for="rcMethod">支払い方法</label><input type="text" id="rcMethod" value="' + esc(doc.method) + '" placeholder="例：カード（末尾1234）／コンビニ払込"></div>' +
        '<div class="field"><label for="rcUrl">確認URL・メモ <span class="opt">（任意）</span></label><input type="text" id="rcUrl" value="' + esc(doc.url) + '" placeholder="予約確認ページのURLや控え番号"></div>' +
        '<div class="field"><label for="rcMemo">備考 <span class="opt">（任意）</span></label><input type="text" id="rcMemo" value="' + esc(doc.memo) + '" placeholder="例：2名分・朝食込み"></div>' +
        '<div class="field"><label for="rcFile">領収書画像・PDFを添付 <span class="opt">（端末内保存・2MBまで）</span></label>' +
          '<input type="file" id="rcFile" accept="image/*,application/pdf" style="font-size:12px;padding:8px"></div>' +
        '<div id="rcAttach"></div>' +
        '<button class="btn-primary" id="rcSave" style="margin-top:10px">💾 保存する</button>' +
      '</div>';

    openSheet('🧾 領収書', html);
    var draft = Object.assign({}, doc);

    function paint() {
      $('receiptPreview').innerHTML = '<div class="doc-wrap">' + receiptDocHtml(draft) + '</div>';
      $('rcAttach').innerHTML = attachHtml(draft.attachment);
      var del = $('rcAttachDel');
      if (del) del.addEventListener('click', function () {
        draft.attachment = null; paint(); toast('添付を外しました（保存で確定）');
      });
    }
    paint();

    ['rcIssuer', 'rcNo', 'rcTo', 'rcDate', 'rcAmount', 'rcPurpose', 'rcMethod', 'rcUrl', 'rcMemo'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', function () {
        draft.issuer = $('rcIssuer').value;
        draft.no = $('rcNo').value;
        draft.addressee = $('rcTo').value;
        draft.date = $('rcDate').value;
        draft.amount = Number($('rcAmount').value) || 0;
        draft.purpose = $('rcPurpose').value;
        draft.method = $('rcMethod').value;
        draft.url = $('rcUrl').value;
        draft.memo = $('rcMemo').value;
        paint();
      });
    });

    $('rcFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { toast('2MBまでにしてください（大きいPDFは圧縮かスクショで）', true); return; }
      var reader = new FileReader();
      reader.onload = function () {
        draft.attachment = { name: f.name, mime: f.type || 'application/octet-stream', size: f.size, dataUrl: String(reader.result) };
        paint();
        toast('添付しました（保存で確定）');
      };
      reader.readAsDataURL(f);
    });

    $('rcPrint').addEventListener('click', function () { printDoc(receiptDocHtml(draft)); });
    $('rcCopy').addEventListener('click', function () {
      var lines = [
        '【領収書】' + (draft.no || ''),
        '発行元：' + (draft.issuer || '—'),
        '宛名：' + ((draft.addressee || '') + ' 様'),
        '発行日：' + fmtDateSlash(draft.date),
        '金額：' + yen(draft.amount),
        '但し書き：' + (draft.purpose || ''),
        '支払い方法：' + (draft.method || ''),
        draft.url ? '確認URL・メモ：' + draft.url : '',
        draft.memo ? '備考：' + draft.memo : ''
      ].filter(Boolean).join('\n');
      copyText(lines).then(function () { toast('領収書の内容をコピーしました'); }, function () { toast('コピーできませんでした', true); });
    });
    $('rcSave').addEventListener('click', function () {
      t.receipt = draft;
      persist();
      closeSheet();
      renderTrips();
      toast('領収書を保存しました');
      signal('予約の領収書を登録しました：' + (draft.issuer || '') + ' ' + yen(draft.amount) + '（' + (draft.purpose || '') + '／' +
        (t.expense === 'business' ? '経費計上' : 'プライベート') + '）');
    });
  }

  function attachHtml(a) {
    if (!a) return '<p class="hint">領収書の画像やPDFを添付しておくと、確定申告のときにすぐ出せます。</p>';
    var thumb = /^image\//.test(a.mime)
      ? '<img src="' + esc(a.dataUrl) + '" alt="領収書">'
      : '<div class="pdf-ic">📄</div>';
    return '<div class="attach-thumb">' + thumb +
      '<div class="an"><b>' + esc(a.name || '添付') + '</b><br>' + Math.round((a.size || 0) / 1024) + 'KB' +
      '<br><button class="mini-btn danger" id="rcAttachDel" style="margin-top:5px">外す</button></div></div>';
  }

  function receiptDocHtml(d) {
    var to = (d.addressee || '').trim() || '上';
    return '' +
      '<div class="doc">' +
        '<div class="doc-head">' +
          '<div><div class="doc-title">領 収 書</div><div class="doc-sub">RECEIPT</div></div>' +
          '<div class="doc-no">No. <b>' + esc(d.no || '') + '</b><br>発行日 ' + esc(fmtDateSlash(d.date)) + '</div>' +
        '</div>' +
        '<div class="doc-to">' + (to ? esc(to) + ' 様' : '様') + '</div>' +
        '<div class="doc-total"><span class="lb">領収金額（税込）</span><span class="amt">' + esc(yen(d.amount)) + '</span></div>' +
        '<table><tbody>' +
          '<tr><th style="width:32%">但し書き</th><td>' + esc(d.purpose || '') + '</td></tr>' +
          '<tr><th>支払い方法</th><td>' + esc(d.method || '—') + '</td></tr>' +
          (d.url ? '<tr><th>確認URL・控え</th><td style="word-break:break-all">' + esc(d.url) + '</td></tr>' : '') +
          (d.memo ? '<tr><th>備考</th><td>' + esc(d.memo) + '</td></tr>' : '') +
        '</tbody></table>' +
        '<div class="doc-foot">上記正に領収いたしました。<br>発行元：' + esc(d.issuer || '—') + '</div>' +
        '<div class="doc-stamp">' + esc(d.issuer || '') + '</div>' +
      '</div>';
  }

  /* ============================================================
     見積書
     ============================================================ */
  function quoteNo() {
    var d = new Date();
    return 'EST-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) +
      '-' + String(100 + Math.floor(Math.random() * 900));
  }
  function parseAmount(s) {
    var m = /([\d,]+)\s*円/.exec(String(s || ''));
    if (!m) return null;
    var n = Number(m[1].replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  function openQuote(src) {
    if (state.shareMode) { toast('共有モード中は見積書を表示できません', true); return; }
    var q = buildQuote(src);
    if (!q) { toast('見積書を作れませんでした', true); return; }
    var html = '' +
      '<div class="card">' +
        '<div id="quotePreview"></div>' +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="mini-btn accent" id="qPrint">🖨 印刷／PDF保存</button>' +
          '<button class="mini-btn" id="qCopy">📋 テキストでコピー</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><span>見積の内容</span></div>' +
        '<div class="field"><label for="qPrimary">' + esc(q.primaryLabel) + '（円）</label>' +
          '<input type="number" id="qPrimary" inputmode="numeric" step="10" value="' + (q.primary || '') + '"></div>' +
        '<div class="field"><label for="qTo">宛名</label><input type="text" id="qTo" value="' + esc(q.addressee) + '" placeholder="空欄なら「様」"></div>' +
        '<div class="field"><label for="qNote">備考 <span class="opt">（任意）</span></label><input type="text" id="qNote" value="' + esc(q.note) + '"></div>' +
        '<button class="btn-primary" id="qSave">📄 この見積書を発行・記録する</button>' +
        '<p class="hint">発行した見積書は予約タブに残り、あとで開いて印刷できます。自動予約のときも「見積書を発行・記録 → 予約」の順で進めます。</p>' +
      '</div>';

    openSheet('📄 見積書', html);
    paintQuote();
    function paintQuote() {
      $('quotePreview').innerHTML = '<div class="doc-wrap">' + quoteDocHtml(q) + '</div>';
    }
    $('qPrimary').addEventListener('input', function () {
      q.primary = Number(this.value) || 0;
      recalcQuote(q);
      paintQuote();
    });
    $('qTo').addEventListener('input', function () { q.addressee = this.value; paintQuote(); });
    $('qNote').addEventListener('input', function () { q.note = this.value; paintQuote(); });
    $('qPrint').addEventListener('click', function () { printDoc(quoteDocHtml(q)); });
    $('qCopy').addEventListener('click', function () {
      copyText(quoteText(q)).then(function () { toast('見積書の内容をコピーしました'); }, function () { toast('コピーできませんでした', true); });
    });
    $('qSave').addEventListener('click', function () {
      q.issuedAt = todayISO();
      state.quotes.unshift(q);
      if (state.quotes.length > 30) state.quotes = state.quotes.slice(0, 30);
      if (src.type === 'trip' && src.trip) {
        var t = state.trips.filter(function (x) { return x.id === src.trip.id; })[0];
        if (t) t.quoteNo = q.no;
      }
      persist();
      closeSheet();
      renderTrips();
      toast('見積書 ' + q.no + ' を発行・記録しました');
      signal('見積書を発行しました：' + q.no + '／' + q.title + '／概算合計 ' + yen(q.total) +
        '／支払い ' + q.payment + '。' + (src.type === 'request' ? 'この見積で問題なければ予約に進めてください。' : ''));
    });
  }

  function buildQuote(src) {
    var q = {
      no: quoteNo(), issuedAt: todayISO(), type: src.type,
      addressee: (state.passport && state.passport.name) || '',
      primary: 0, primaryLabel: '運賃・宿泊費',
      items: [], total: 0, payment: defaultPayText(),
      cancel: '', note: '', title: '', subtitle: '', period: '', people: '', conditions: []
    };
    if (src.type === 'deal') {
      var d = src.deal;
      var prod = productOf(d);
      q.title = d.airline + ' ' + d.title;
      q.primaryLabel = prod === 'hotel' ? '宿泊費（1泊）' : '運賃（1名）';
      q.primary = parseAmount(d.priceMain) || 0;
      q.period = periodText(d);
      q.subtitle = PRODUCT_LABEL[prod];
      q.cancel = '各社の運賃条件によります（変更・払戻の可否を確認）';
      q.note = d.priceSub || '';
    } else if (src.type === 'trip') {
      var t = src.trip;
      var k = tripKindOf(t);
      q.title = t.kind === 'hotel' ? ((t.hotel && (t.hotel.name || t.hotel.area)) || 'ホテル') :
        (t.flight || '') + ' ' + (t.from || '') + '→' + (t.to || '');
      q.primaryLabel = k === 'hotel' ? '宿泊費' : '運賃';
      q.primary = Number(t.price) || 0;
      var nights = tripNights(t);
      q.period = fmtDate(tripDate(t), true) + (nights != null ? '（' + nights + '泊）' : '');
      q.subtitle = PRODUCT_LABEL[k];
      q.cancel = (t.hotel && t.hotel.cancel) || '';
      q.note = t.memo || '';
      q.tripId = t.id;
    } else {
      var r = src.request;
      var kk = r.kind || 'flight';
      q.title = kk === 'hotel' ? (placeText(r.city) || 'ホテル') :
        placeText(r.from) + ' → ' + placeText(r.to) + (kk === 'package' ? ' ＋ ホテル' : '');
      q.primaryLabel = kk === 'hotel' ? '宿泊費（1泊 × ' + (hotelNights(r) || 1) + '泊・予算上限ベース）' : '運賃（予算上限ベース）';
      q.basis = 'request';
      q.primary = kk === 'hotel' ? (Number(r.hotelBudget) || 0) * Math.max(1, hotelNights(r) || 1) : (Number(r.budget) || 0);
      q.period = requestPeriodText(r);
      q.subtitle = PRODUCT_LABEL[kk];
      q.people = (r.guests ? r.guests + '名' : '1名');
      q.hotelTotal = (Number(r.hotelBudget) || 0) * Math.max(1, hotelNights(r) || 1);
      q.cancel = r.kind === 'flight' ? '運賃条件による' : (r.freeCancel ? 'キャンセル無料（前日まで）' : '宿泊施設の規定による');
      q.payment = payText(r);
      q.note = r.memo || '';
      q.policy = r.policy;
      q.seat = r.seat;
      q.baggage = r.baggage;
    }
    if (q.primary == null) q.primary = 0;
    recalcQuote(q);
    return q;
  }

  function recalcQuote(q) {
    var items = [];
    var kk = q.subtitle === 'ホテル' ? 'hotel' : (q.subtitle === '航空券＋ホテル' ? 'package' : 'flight');
    if (q.subtitle === 'ホテル') {
      if (q.primary) items.push({ label: q.primaryLabel, amount: q.primary });
    } else {
      if (q.primary) items.push({ label: q.primaryLabel.replace(/（1泊）/, ''), amount: q.primary });
      var intl = /TPE|ICN|TSA|HKG|AMS|ヨーロッパ|台北|ソウル|香港/.test(q.title + ' ' + q.period) || kk === 'package';
      items.push({ label: '諸税・空港使用料（概算）', amount: intl ? 6000 : 2000, note: '目安' });
      if (q.baggage === '20kg' || q.baggage === '23kg') items.push({ label: '受託手荷物 ' + q.baggage + '（概算）', amount: 3000, note: '目安' });
      if (kk === 'package') items.push({ label: '宿泊費（ホテル分・概算）', amount: Math.round((q.hotelTotal || 0)), note: '目安' });
    }
    q.items = items.filter(function (i) { return i.amount || i.amount === 0; });
    q.total = q.items.reduce(function (s, i) { return s + (Number(i.amount) || 0); }, 0);
  }

  function quoteDocHtml(q) {
    var to = (q.addressee || '').trim() || '上';
    var rows = q.items.map(function (i) {
      return '<tr><td>' + esc(i.label) + (i.note ? '　<span style="color:#777">(' + esc(i.note) + ')</span>' : '') + '</td>' +
        '<td class="num">' + esc(yen(i.amount)) + '</td></tr>';
    }).join('');
    return '' +
      '<div class="doc">' +
        '<div class="doc-head">' +
          '<div><div class="doc-title">見 積 書</div><div class="doc-sub">ESTIMATE</div></div>' +
          '<div class="doc-no">No. <b>' + esc(q.no) + '</b><br>発行日 ' + esc(fmtDateSlash(q.issuedAt)) + '</div>' +
        '</div>' +
        '<div class="doc-to">' + (to ? esc(to) + ' 様' : '様') + '</div>' +
        '<div class="doc-meta">' +
          '<div>対象：' + esc(q.subtitle || '—') + '</div>' +
          '<div>人数：' + esc(q.people || '1名') + '</div>' +
          '<div style="grid-column:1/-1">内容：' + esc(q.title || '—') + '</div>' +
          '<div style="grid-column:1/-1">日程：' + esc(q.period || '—') + '</div>' +
        '</div>' +
        '<div class="doc-total"><span class="lb">概算合計（税込）</span><span class="amt">' + esc(yen(q.total)) + '</span></div>' +
        '<table><thead><tr><th>内訳</th><th class="num">金額</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="doc-foot">' +
          '・支払い方法：' + esc(q.payment || '—') + '<br>' +
          '・キャンセル規定：' + esc(q.cancel || '予約時に確認') + '<br>' +
          (q.policy === 'auto' ? '・進め方：条件内なら自動予約（見積書を発行・記録してから確保）<br>' : '') +
          (q.policy === 'quote' ? '・進め方：この見積書での確認後に予約<br>' : '') +
          (q.basis === 'request' ? '・金額はご予算を上限に置いた概算です（実額は検索結果で確定）。<br>' : '') +
          '・表示額は概<b>算</b>です。実際の運賃・空室料金・諸税は予約確定画面の額が優先されます。<br>' +
          (q.note ? '・備考：' + esc(q.note) + '<br>' : '') +
        '</div>' +
        '<div class="doc-stamp">発行：フライトウォッチ（ももか）</div>' +
      '</div>';
  }

  function quoteText(q) {
    var lines = [
      '【見積書】' + q.no + '（発行日 ' + fmtDateSlash(q.issuedAt) + '）',
      '宛名：' + ((q.addressee || '') + ' 様'),
      '対象：' + (q.subtitle || ''),
      '内容：' + (q.title || ''),
      '日程：' + (q.period || ''),
      '--- 内訳 ---'
    ];
    q.items.forEach(function (i) { lines.push('・' + i.label + '：' + yen(i.amount)); });
    lines.push('概算合計（税込）：' + yen(q.total));
    lines.push('支払い方法：' + (q.payment || ''));
    lines.push('キャンセル規定：' + (q.cancel || ''));
    if (q.note) lines.push('備考：' + q.note);
    return lines.join('\n');
  }

  function renderQuotes() {
    if (!$('quoteList')) return;
    var list = state.quotes || [];
    $('quoteCount').textContent = list.length + '件';
    if (!list.length) {
      $('quoteList').innerHTML = '<div class="empty" style="padding:16px 0">まだ見積書はないよ。<br>セール詳細・リクエスト・予約から「📄 見積書を発行」できる。</div>';
      return;
    }
    $('quoteList').innerHTML = list.map(function (q, i) {
      return '<div class="card-line">' +
        '<div class="cl-main"><div class="cl-name">' + esc(q.no) + '　' + esc(yen(q.total)) + '</div>' +
        '<div class="cl-sub">' + esc(fmtDate(q.issuedAt, true)) + ' ／ ' + esc(q.title || '') + '</div></div>' +
        '<button class="mini-btn accent" data-qopen="' + i + '">開く</button>' +
        '<button class="mini-btn" data-qprint="' + i + '">🖨</button>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call($('quoteList').querySelectorAll('[data-qopen]'), function (b) {
      b.addEventListener('click', function () {
        var q = state.quotes[Number(b.getAttribute('data-qopen'))];
        if (!q) return;
        openSheet('📄 見積書 ' + q.no,
          '<div class="card"><div class="doc-wrap">' + quoteDocHtml(q) + '</div>' +
          '<div class="btn-row" style="margin-top:12px"><button class="mini-btn accent" id="q2Print">🖨 印刷／PDF保存</button>' +
          '<button class="mini-btn" id="q2Copy">📋 コピー</button></div></div>');
        $('q2Print').addEventListener('click', function () { printDoc(quoteDocHtml(q)); });
        $('q2Copy').addEventListener('click', function () {
          copyText(quoteText(q)).then(function () { toast('コピーしました'); }, function () { toast('コピーできませんでした', true); });
        });
      });
    });
    Array.prototype.forEach.call($('quoteList').querySelectorAll('[data-qprint]'), function (b) {
      b.addEventListener('click', function () {
        var q = state.quotes[Number(b.getAttribute('data-qprint'))];
        if (q) printDoc(quoteDocHtml(q));
      });
    });
  }

  function printDoc(innerHtml) {
    $('printRoot').innerHTML = '<div class="doc-wrap">' + innerHtml + '</div>';
    try { window.print(); } catch (e) { toast('この画面では印刷できないみたい', true); }
  }

  /* ============================================================
     タブ3：監視リクエスト
     ============================================================ */
  function reqKind() {
    var el = document.querySelector('input[name="reqKind"]:checked');
    return el ? el.value : 'flight';
  }
  function hotelNights(r) {
    if (!r.checkIn || !r.checkOut) return null;
    var n = dayDiff(r.checkIn, r.checkOut);
    return (n == null || n < 0) ? null : n;
  }
  function defaultCard() {
    var cards = state.payment.cards || [];
    var d = cards.filter(function (c) { return c.id === state.payment.defaultId; })[0];
    return d || cards[0] || null;
  }
  function cardLabel(c) {
    if (!c) return '';
    var n = String(c.name || '').replace(/[（(][^）)]*[）)]\s*$/, '').trim() || c.name;
    return n + (c.last4 ? '（末尾' + c.last4 + '）' : '');
  }
  function defaultPayText() {
    if (state.shareMode) return '（非表示）';
    var c = defaultCard();
    if (c) return 'カード ' + cardLabel(c);
    var st = state.payment.conv.store;
    if (st && st !== CONV_STORES[0]) return 'コンビニ（' + st + '）';
    return 'カード決済（未登録）';
  }

  function readReqForm() {
    var typeEl = document.querySelector('input[name="reqType"]:checked');
    var polEl = document.querySelector('input[name="reqPolicy"]:checked');
    var payEl = document.querySelector('input[name="reqPay"]:checked');
    var kind = reqKind();
    var cardSel = $('reqCardSel').value;
    var card = state.payment.cards.filter(function (c) { return c.id === cardSel; })[0] || null;
    var convSel = $('reqConvSel').value || state.payment.conv.store;
    return {
      id: state.editingRequest || uid('r'),
      createdAt: new Date().toISOString(),
      kind: kind,
      type: typeEl ? typeEl.value : 'round',
      depart: $('reqDepart').value,
      ret: $('reqReturn').value,
      from: $('reqFrom').value,
      to: $('reqTo').value,
      time: $('reqTime').value,
      airline: $('reqAirline').value,
      budget: Number($('reqBudget').value) || 0,
      city: $('reqCity').value.trim(),
      checkIn: $('reqCheckIn').value,
      checkOut: $('reqCheckOut').value,
      hotelBudget: Number($('reqHotelBudget').value) || 0,
      guests: $('reqGuests').value,
      chain: $('reqChain').value,
      freeCancel: $('reqFreeCancel').checked,
      policy: polEl ? polEl.value : 'confirm',
      payMode: payEl ? payEl.value : 'card',
      cardId: card ? card.id : '',
      convStore: convSel,
      seat: $('reqSeat').value,
      baggage: $('reqBaggage').value,
      expense: $('reqExpense').checked,
      memo: $('reqMemo').value.trim(),
      status: state.editingRequest ? (currentReqStatus() || 'draft') : 'draft'
    };
  }
  function placeText(v) {
    if (!v) return '未定';
    var m = /^([A-Z]{3})\s+(.+)$/.exec(v);
    if (m) return m[2] + '（' + m[1] + '）';
    return v;
  }
  function currentReqStatus() {
    var r = state.requests.filter(function (x) { return x.id === state.editingRequest; })[0];
    return r ? r.status : 'draft';
  }
  function nightsText(r) {
    if (r.type === 'oneway' || !r.ret || !r.depart) return '';
    var n = dayDiff(r.depart, r.ret);
    if (n == null || n < 0) return '';
    return n === 0 ? '日帰り' : n + '泊' + (n + 1) + '日';
  }
  function requestPeriodText(r) {
    if (r.kind === 'hotel') {
      if (!r.checkIn) return '日程未定';
      var n = hotelNights(r);
      return fmtDate(r.checkIn, true) + '〜' + (r.checkOut ? fmtDate(r.checkOut, true) : '未定') + (n != null ? '（' + n + '泊）' : '');
    }
    if (!r.depart) return '日程未定';
    return fmtDate(r.depart, true) + (r.type === 'oneway' ? ' 出発' : (r.ret ? ' 〜 ' + fmtDate(r.ret, true) + ' 帰着' : ' 出発（帰着未定）')) +
      (nightsText(r) ? '（' + nightsText(r) + '）' : '');
  }
  function payText(r) {
    if (state.shareMode) return '（共有モード中は非表示）';
    if (r.payMode === 'conv') {
      var st = r.convStore || state.payment.conv.store;
      return 'コンビニ支払い（' + st + 'で払込票を発行' + (state.payment.conv.memo ? '／' + state.payment.conv.memo : '') + '）';
    }
    var c = state.payment.cards.filter(function (x) { return x.id === r.cardId; })[0] || defaultCard();
    return c ? '登録済みカード「' + cardLabel(c) + '」で決済' : '登録済みカード（未登録：決済前に登録してください）';
  }
  function policyText(r) {
    if (r.policy === 'auto') {
      return 'セール条件内なら自動予約（即確保）：条件に合うセール・運賃（ホテルは空室と料金）を検知したら、まず見積書（概算）を発行・記録し、そのままブラウザで確保して決済まで進めてOK。カードなら決済控えを、コンビニなら払込票（バーコード／受付番号）をチャットへ即お届け。条件を超える場合だけ確認カードを出して。';
    }
    if (r.policy === 'quote') {
      return '見積書を発行して確認後に予約：候補が出たら見積書（内訳・合計・支払い・キャンセル規定）を発行して見せて、OKをもらってから予約・決済してください。';
    }
    return '確認カードを出して（金額と条件を見て自分で決済を決めます）';
  }

  function buildRequestText(r) {
    var L = [];
    var k = r.kind || 'flight';
    L.push('【' + PRODUCT_LABEL[k] + 'の監視リクエスト】');
    if (k !== 'hotel') {
      L.push('・区間：' + placeText(r.from) + ' → ' + placeText(r.to) + '／' + (r.type === 'oneway' ? '片道' : '往復'));
    }
    if (k === 'hotel') {
      L.push('・ホテル：' + (r.city || 'エリア未定') + '／' + (r.chain === '指定なし' ? 'チェーン指定なし（安いところ）' : r.chain + '優先'));
      L.push('・日程：' + requestPeriodText(r));
      L.push('・1泊の予算上限：' + (r.hotelBudget ? '¥' + r.hotelBudget.toLocaleString('ja-JP') + '（税込・' + r.guests + '名）' : '未設定（相場より安い目玉なら教えて）'));
      L.push('・キャンセル条件：' + (r.freeCancel ? 'キャンセル無料のプランのみ' : '指定なし'));
    } else {
      L.push('・日程：' + requestPeriodText(r));
      L.push('・希望時間帯：' + r.time);
      L.push('・希望航空会社：' + r.airline);
      L.push('・予算上限：' + (r.budget ? '¥' + r.budget.toLocaleString('ja-JP') + '（税・手数料込み）' : '未設定（相場より安い目玉なら教えて）'));
      L.push('・座席の希望：' + (r.seat || '指定なし'));
      L.push('・受託手荷物：' + (r.baggage || '指定なし'));
      if (k === 'package') {
        L.push('・ホテル：' + (r.city || 'エリア未定') + '／' + (r.chain === '指定なし' ? 'チェーン指定なし' : r.chain + '優先') + '／' + requestPeriodText(r));
        L.push('・1泊の予算上限：' + (r.hotelBudget ? '¥' + r.hotelBudget.toLocaleString('ja-JP') + '（税込・' + r.guests + '名）' : '未設定'));
        L.push('・キャンセル条件：' + (r.freeCancel ? 'キャンセル無料のプランのみ' : '指定なし'));
      }
    }
    L.push('・見つけたときの進め方：' + policyText(r));
    L.push('・自動予約：' + (r.policy === 'auto' ? 'ON（条件内は自動で確保・見積書を発行してから予約）' : 'OFF（確認してから）'));
    L.push('・支払い方法：' + payText(r));
    L.push('・確定申告：' + (r.expense ? '旅費交通費として経費計上する（ウィジェットにも「経費」で反映）' : '経費にしない（プライベート）'));
    if (r.memo) L.push('・その他：' + r.memo);
    L.push('');
    L.push('この条件で常時監視して、条件に合うものが出たら金額・便名／ホテル名・時刻を教えてください。');
    if (r.policy === 'auto') L.push('自動予約の際は、見積書（概算）を発行・記録してから確保してください。');
    return L.join('\n');
  }

  function updatePreview() {
    if (!$('reqPreview')) return;
    var k = reqKind();
    $('reqFlightBlock').classList.toggle('hidden', k === 'hotel');
    $('reqHotelBlock').classList.toggle('hidden', k === 'flight');
    $('reqSeatField').classList.toggle('hidden', k === 'hotel');
    var payEl = document.querySelector('input[name="reqPay"]:checked');
    var pay = payEl ? payEl.value : 'card';
    $('reqCardWrap').classList.toggle('hidden', pay !== 'card');
    $('reqConvWrap').classList.toggle('hidden', pay !== 'conv');
    var r = readReqForm();
    $('reqPreview').textContent = buildRequestText(r);
    $('reqReturnWrap').classList.toggle('hidden', r.type === 'oneway');
    $('policyHint').textContent = r.policy === 'auto'
      ? '「自動予約（即確保）」：条件内なら見積書を発行・記録してから予約と決済まで進めます。決済方法（カード／コンビニ）を先に登録しておいてね。'
      : r.policy === 'quote'
        ? '「見積書を発行して確認後に予約」：内訳つきの見積書を見せて、OKをもらってから予約します。'
        : '「確認カードを出す」：候補と金額を見て、決済は自分で判断します。';
  }

  function saveRequest(r) {
    var txt = buildRequestText(r);
    var idx = -1;
    state.requests.forEach(function (x, i) { if (x.id === r.id) idx = i; });
    var rec = Object.assign({}, r, { text: txt });
    if (idx >= 0) {
      rec.createdAt = state.requests[idx].createdAt;
      state.requests[idx] = rec;
    } else {
      state.requests.unshift(rec);
    }
    persist();
    renderRequests();
    updateNewDot();
    return rec;
  }

  function renderPayOptions() {
    var cards = state.payment.cards || [];
    var def = defaultCard();
    $('reqCardSel').innerHTML = cards.length
      ? cards.map(function (c, i) {
        var label = state.shareMode ? ('登録カード' + (i + 1)) : (c.name + (c.last4 ? '（末尾' + c.last4 + '）' : ''));
        return '<option value="' + esc(c.id) + '"' + (def && def.id === c.id ? ' selected' : '') + '>' + esc(label) + '</option>';
      }).join('')
      : '<option value="">カード未登録（設定タブで追加）</option>';
    var store = state.payment.conv.store || CONV_STORES[0];
    $('reqConvSel').innerHTML = CONV_STORES.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === store ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  function clearReqForm() {
    state.editingRequest = null;
    $('reqMode').textContent = '新規';
    $('btnReqCancel').classList.add('hidden');
    var p = state.prefs;
    $('reqDepart').value = '';
    $('reqReturn').value = '';
    $('reqBudget').value = p.budget || '';
    $('reqTime').value = p.time || '朝発・夜帰国';
    $('reqMemo').value = '';
    $('reqExpense').checked = true;
    $('reqCity').value = '';
    $('reqCheckIn').value = '';
    $('reqCheckOut').value = '';
    $('reqHotelBudget').value = '';
    $('reqGuests').value = '1';
    $('reqChain').value = '指定なし';
    $('reqFreeCancel').checked = true;
    $('reqSeat').value = '指定なし';
    $('reqBaggage').value = '指定なし';
    document.querySelector('input[name="reqKind"][value="flight"]').checked = true;
    $('reqTypeSeg').querySelector('input[value="round"]').checked = true;
    document.querySelector('input[name="reqPolicy"][value="confirm"]').checked = true;
    document.querySelector('input[name="reqPay"][value="card"]').checked = true;
    renderPayOptions();
    if (p.airports && p.airports.length) {
      var a = p.airports[0];
      var opt = Array.prototype.filter.call($('reqFrom').options, function (o) { return o.value.indexOf(a) === 0; })[0];
      if (opt) $('reqFrom').value = opt.value;
    }
    updatePreview();
  }

  function statusPillOf(s) {
    if (s === 'sent') return '<span class="pill soon">送信済み</span>';
    if (s === 'watching') return '<span class="pill live">監視中</span>';
    if (s === 'done') return '<span class="pill ended">完了</span>';
    return '<span class="pill ended">下書き</span>';
  }

  function renderRequests() {
    var list = state.requests;
    $('reqCount').textContent = list.length + '件';
    if (!list.length) {
      $('reqList').innerHTML = '<div class="empty">まだリクエストはないよ。<br>上のフォームで条件を入れて作ってみて。</div>';
      return;
    }
    $('reqList').innerHTML = list.map(function (r) {
      var k = r.kind || 'flight';
      var title = k === 'hotel' ? ('🛏 ' + (r.city || 'ホテル') + '／' + (r.guests || '1') + '名')
        : (k === 'package' ? '🧳 ' : '') + placeText(r.from) + ' → ' + placeText(r.to) + '／' + (r.type === 'oneway' ? '片道' : '往復');
      var meta = [requestPeriodText(r)];
      if (k === 'hotel') { if (r.hotelBudget) meta.push('1泊 ' + yen(r.hotelBudget)); }
      else if (r.budget) meta.push('予算 ' + yen(r.budget));
      if (k !== 'hotel') meta.push(r.time);
      meta.push(r.policy === 'auto' ? '自動予約' : r.policy === 'quote' ? '見積後に予約' : '確認カード');
      meta.push(r.payMode === 'conv' ? 'コンビニ払い' : 'カード');
      if (r.expense) meta.push('経費');
      return '' +
        '<div class="req" data-req="' + esc(r.id) + '">' +
          '<div class="req-top"><div class="req-title">' + esc(title) + '</div>' + statusPillOf(r.status) + '</div>' +
          '<div class="req-meta">' + esc(meta.join(' ／ ')) + '</div>' +
          '<div class="req-actions">' +
            '<button class="mini-btn accent" data-reqcopy="' + esc(r.id) + '">📋 依頼文</button>' +
            '<button class="mini-btn" data-reqquote="' + esc(r.id) + '">📄 見積書</button>' +
            '<button class="mini-btn" data-reqedit="' + esc(r.id) + '">編集</button>' +
            '<button class="mini-btn" data-reqstatus="' + esc(r.id) + '">状態</button>' +
            '<button class="mini-btn danger" data-reqdel="' + esc(r.id) + '">削除</button>' +
          '</div>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call($('reqList').querySelectorAll('[data-reqcopy]'), function (b) {
      b.addEventListener('click', function () { copyRequest(b.getAttribute('data-reqcopy')); });
    });
    Array.prototype.forEach.call($('reqList').querySelectorAll('[data-reqquote]'), function (b) {
      b.addEventListener('click', function () {
        var r = state.requests.filter(function (x) { return x.id === b.getAttribute('data-reqquote'); })[0];
        if (r) openQuote({ type: 'request', request: r });
      });
    });
    Array.prototype.forEach.call($('reqList').querySelectorAll('[data-reqedit]'), function (b) {
      b.addEventListener('click', function () { editRequest(b.getAttribute('data-reqedit')); });
    });
    Array.prototype.forEach.call($('reqList').querySelectorAll('[data-reqstatus]'), function (b) {
      b.addEventListener('click', function () { cycleStatus(b.getAttribute('data-reqstatus')); });
    });
    Array.prototype.forEach.call($('reqList').querySelectorAll('[data-reqdel]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-reqdel');
        if (!window.confirm('このリクエストを削除しますか？')) return;
        state.requests = state.requests.filter(function (x) { return x.id !== id; });
        persist(); renderRequests();
      });
    });
  }

  function copyRequest(id) {
    var r = state.requests.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    copyText(r.text || buildRequestText(r)).then(function () {
      if (r.status === 'draft') { r.status = 'sent'; persist(); renderRequests(); }
      toast('依頼文をコピーしました。チャットに貼ってね 📋');
      signal('フライトウォッチで監視リクエストをコピーしました：' + PRODUCT_LABEL[r.kind || 'flight'] + '／' +
        (r.kind === 'hotel' ? (r.city || '') + ' ' + requestPeriodText(r) : placeText(r.from) + '→' + placeText(r.to) + '／' + requestPeriodText(r)) +
        '／予算' + yen(r.kind === 'hotel' ? r.hotelBudget : r.budget) +
        '／' + (r.policy === 'auto' ? '自動予約ON（見積書発行→確保）' : r.policy === 'quote' ? '見積書発行→確認後に予約' : '確認カード') +
        '／支払い' + payText(r) + '／席' + (r.seat || '指定なし') + '／荷物' + (r.baggage || '指定なし') +
        '。チャットに貼られてきたら監視を開始してください。');
    }, function () { toast('コピーできませんでした', true); });
  }

  function editRequest(id) {
    var r = state.requests.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    state.editingRequest = id;
    $('reqMode').textContent = '編集中';
    $('btnReqCancel').classList.remove('hidden');
    var k = r.kind || 'flight';
    var kel = document.querySelector('input[name="reqKind"][value="' + k + '"]');
    if (kel) kel.checked = true;
    document.querySelector('input[name="reqType"][value="' + r.type + '"]').checked = true;
    $('reqDepart').value = r.depart || '';
    $('reqReturn').value = r.ret || '';
    $('reqTime').value = r.time;
    $('reqAirline').value = r.airline;
    $('reqBudget').value = r.budget || '';
    $('reqCity').value = r.city || '';
    $('reqCheckIn').value = r.checkIn || '';
    $('reqCheckOut').value = r.checkOut || '';
    $('reqHotelBudget').value = r.hotelBudget || '';
    $('reqGuests').value = r.guests || '1';
    $('reqChain').value = r.chain || '指定なし';
    $('reqFreeCancel').checked = r.freeCancel !== false;
    document.querySelector('input[name="reqPolicy"][value="' + (r.policy || 'confirm') + '"]').checked = true;
    var pel = document.querySelector('input[name="reqPay"][value="' + (r.payMode || 'card') + '"]');
    if (pel) pel.checked = true;
    renderPayOptions();
    if (r.cardId) $('reqCardSel').value = r.cardId;
    if (r.convStore) $('reqConvSel').value = r.convStore;
    $('reqSeat').value = r.seat || '指定なし';
    $('reqBaggage').value = r.baggage || '指定なし';
    $('reqExpense').checked = !!r.expense;
    $('reqMemo').value = r.memo || '';
    if (Array.prototype.some.call($('reqFrom').options, function (o) { return o.value === r.from; })) $('reqFrom').value = r.from;
    if (Array.prototype.some.call($('reqTo').options, function (o) { return o.value === r.to; })) $('reqTo').value = r.to;
    switchTab('request');
    updatePreview();
    window.scrollTo(0, 0);
    toast('読み込んだよ。直して保存してね');
  }

  function cycleStatus(id) {
    var order = ['draft', 'sent', 'watching', 'done'];
    var r = state.requests.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var i = order.indexOf(r.status);
    r.status = order[(i + 1) % order.length];
    persist(); renderRequests();
    toast('状態：' + ({ draft: '下書き', sent: '送信済み', watching: '監視中', done: '完了' })[r.status]);
  }

  /* ============================================================
     タブ4：設定
     ============================================================ */
  function passportReport() {
    var p = state.passport || {};
    if (!p.expiry) {
      return { cls: 'info', ic: '🛂', html: '有効期限を入れると、<b>残り6ヶ月・3ヶ月</b>を切った時点でここに警告が出ます。' };
    }
    var days = dayDiff(todayISO(), p.expiry);
    var m = monthsOf(days);
    var base = '有効期限 ' + fmtDate(p.expiry, true) + '（残り ' + (days >= 0 ? days + '日・約' + fmtMonths(m) : '0日') + '）';
    var nextIntl = null;
    sortedTrips().forEach(function (t) {
      if (!nextIntl && t.intl && (tripDate(t) || '') >= todayISO()) nextIntl = t;
    });
    var intlNote = '';
    if (nextIntl) {
      var dAt = dayDiff(tripDate(nextIntl), p.expiry);
      var mAt = monthsOf(dAt);
      intlNote = dAt < 0
        ? '<div style="margin-top:6px">次の海外渡航 <b>' + esc(fmtDate(tripDate(nextIntl), true)) + '</b> より前に<b>有効期限が切れます</b>。渡航前に更新が必要。</div>'
        : '<div style="margin-top:6px">次の海外渡航 <b>' + esc(fmtDate(tripDate(nextIntl), true)) + '</b> 時点で残り <b>' +
          Math.round(dAt) + '日（約' + fmtMonths(mAt) + '）</b>' +
          (dAt >= 183 ? ' … 6ヶ月以上ありOK' : ' … <b>6ヶ月未満</b>。入国条件を確認して') + '</div>';
    }
    if (days < 0) {
      return { cls: 'danger', ic: '🚨', html: '<b>パスポートの有効期限が切れています。</b>' + esc(base) + '。更新手続きを。' + intlNote };
    }
    if (days < 92) {
      return { cls: 'danger', ic: '🚨', html: '<b>残り3ヶ月未満！</b>' + esc(base) + '。多くの国は入国時に6ヶ月以上の残存を求めるので、渡航前に更新を。' + intlNote };
    }
    if (days < 183) {
      return { cls: 'warn', ic: '⚠️', html: '<b>残り6ヶ月未満。</b>' + esc(base) + '。渡航先の入国条件（6ヶ月ルール）を確認して。' + intlNote };
    }
    return { cls: 'ok', ic: '✅', html: '<b>6ヶ月以上あり。</b>' + esc(base) + intlNote };
  }

  function renderPassport() {
    var rep = passportReport();
    $('passStatus').innerHTML = '<div class="banner ' + rep.cls + '" style="margin-bottom:12px"><span class="ic">' + rep.ic + '</span><div>' + rep.html + '</div></div>';
    var p = state.passport || {};
    $('passName').value = p.name || '';
    var numEl = $('passNumber');
    if (state.showPass) {
      numEl.value = p.number || '';
      numEl.removeAttribute('data-masked');
      numEl.type = 'text';
    } else {
      numEl.value = p.number ? '••••••' : '';
      numEl.setAttribute('data-masked', '1');
      numEl.type = 'text';
    }
    $('passExpiry').value = p.expiry || '';
    $('passIssued').value = p.issued || '';
    $('passCountry').value = p.country || '';
    $('btnTogglePass').textContent = state.showPass ? '番号を隠す' : '番号を表示';
  }

  function savePassport() {
    var numEl = $('passNumber');
    var num = numEl.value.trim();
    if (numEl.getAttribute('data-masked') && num === '••••••') num = state.passport.number || '';
    state.passport = {
      name: $('passName').value.trim().toUpperCase(),
      number: num,
      expiry: $('passExpiry').value,
      issued: $('passIssued').value,
      country: $('passCountry').value.trim()
    };
    persist();
    renderPassport();
    var rep = passportReport();
    toast(rep.cls === 'danger' ? '保存しました。⚠️ 有効期限の警告を確認してね' : 'パスポート情報を保存しました');
  }

  function renderCards() {
    var cards = state.payment.cards || [];
    $('payCount').textContent = cards.length + '件・コンビニ' + (state.payment.conv.store && state.payment.conv.store !== CONV_STORES[0] ? '設定済み' : '未設定');
    if (!cards.length) {
      $('cardList').innerHTML = '<div class="empty" style="padding:14px 0">カードはまだ未登録。<br><span style="font-size:11px">呼び名と末尾4桁だけでOK（番号・CVCは入れません）。</span></div>';
    } else {
      $('cardList').innerHTML = cards.map(function (c) {
        var key = 'card:' + c.id;
        var shown = state.revealed[key];
        var isDef = state.payment.defaultId === c.id;
        return '<div class="card-line">' +
          '<div class="cl-main"><div class="cl-name">' +
            (shown ? esc(c.name) : '••••') + (c.last4 ? '（末尾' + esc(c.last4) + '）' : '') +
            (isDef ? '<span class="def-tag">既定</span>' : '') + '</div>' +
            '<div class="cl-sub">' + (isDef ? '自動予約・見積書で使うカード' : 'タップで既定にできます') + '</div></div>' +
          '<button class="mini-btn" data-cardreveal="' + esc(key) + '">' + (shown ? '隠す' : '👁') + '</button>' +
          (isDef ? '' : '<button class="mini-btn accent" data-carddef="' + esc(c.id) + '">既定に</button>') +
          '<button class="mini-btn danger" data-carddel="' + esc(c.id) + '">削除</button>' +
          '</div>';
      }).join('');
      Array.prototype.forEach.call($('cardList').querySelectorAll('[data-cardreveal]'), function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-cardreveal');
          state.revealed[k] = !state.revealed[k];
          renderCards();
        });
      });
      Array.prototype.forEach.call($('cardList').querySelectorAll('[data-carddef]'), function (b) {
        b.addEventListener('click', function () {
          state.payment.defaultId = b.getAttribute('data-carddef');
          persist(); renderCards(); renderPayOptions(); updatePreview();
          toast('既定のカードにしました');
        });
      });
      Array.prototype.forEach.call($('cardList').querySelectorAll('[data-carddel]'), function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-carddel');
          if (!window.confirm('このカードの登録を削除しますか？')) return;
          state.payment.cards = cards.filter(function (c) { return c.id !== id; });
          if (state.payment.defaultId === id) state.payment.defaultId = (state.payment.cards[0] || {}).id || '';
          persist(); renderCards(); renderPayOptions(); updatePreview();
          toast('削除しました');
        });
      });
    }
    $('convStore').value = state.payment.conv.store || CONV_STORES[0];
    $('convMemo').value = state.payment.conv.memo || '';
    renderPayOptions();
  }

  function addCard() {
    var name = $('newCardName').value.trim();
    var last4 = $('newCardLast4').value.replace(/\D/g, '');
    if (!name) { toast('カードの呼び名を入れてね', true); return; }
    if (/\d{8,}/.test(name.replace(/\s/g, ''))) {
      toast('カード番号は入力できません。呼び名と末尾4桁だけにしてください', true);
      return;
    }
    if (last4 && last4.length !== 4) { toast('末尾4桁は4桁で入れてね', true); return; }
    var id = uid('c');
    state.payment.cards.push({ id: id, name: name, last4: last4 });
    if (!state.payment.defaultId) state.payment.defaultId = id;
    persist();
    $('newCardName').value = '';
    $('newCardLast4').value = '';
    renderCards(); updatePreview();
    toast('カードを登録しました');
  }

  function renderMileage() {
    var list = state.mileage;
    if (!list.length) {
      $('mileageList').innerHTML = '<div class="empty" style="padding:14px 0">まだ登録されていないよ。下から追加できる。</div>';
      return;
    }
    $('mileageList').innerHTML = list.map(function (m) {
      var key = 'mile:' + m.id;
      var shown = state.showMiles || state.revealed[key];
      return '' +
        '<div class="mile">' +
          '<div class="mile-main">' +
            '<div class="mile-name">' + esc(m.program) + '</div>' +
            '<div class="mile-num ' + (shown ? '' : 'masked') + '">' + esc(shown ? (m.number || '—') : '••••••') + '</div>' +
            (m.memo ? '<div class="mile-memo">' + esc(m.memo) + '</div>' : '') +
          '</div>' +
          '<button class="mini-btn" data-milereveal="' + esc(key) + '">' + (shown ? '隠す' : '👁') + '</button>' +
          '<button class="mini-btn" data-milecopy="' + esc(m.id) + '">コピー</button>' +
          '<button class="mini-btn danger" data-miledel="' + esc(m.id) + '">削除</button>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call($('mileageList').querySelectorAll('[data-milereveal]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-milereveal');
        state.revealed[k] = !state.revealed[k];
        renderMileage();
      });
    });
    Array.prototype.forEach.call($('mileageList').querySelectorAll('[data-milecopy]'), function (b) {
      b.addEventListener('click', function () {
        var m = list.filter(function (x) { return x.id === b.getAttribute('data-milecopy'); })[0];
        if (!m || !m.number) { toast('番号が入っていないよ', true); return; }
        copyText(m.number).then(function () { toast(m.program + ' の会員番号をコピーしました'); },
          function () { toast('コピーできませんでした', true); });
      });
    });
    Array.prototype.forEach.call($('mileageList').querySelectorAll('[data-miledel]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-miledel');
        if (!window.confirm('この会員番号を削除しますか？')) return;
        state.mileage = list.filter(function (x) { return x.id !== id; });
        persist(); renderMileage();
      });
    });
  }

  function renderLock() {
    var on = !!state.lock.hash;
    $('lockState').textContent = on ? (state.unlocked ? '解除中' : 'ロック中') : '未設定';
    if (!on) {
      $('lockBody').innerHTML = '' +
        '<div class="two-col">' +
          '<div class="field" style="margin-bottom:8px"><label for="pinNew1">PIN（4桁）</label><input type="password" id="pinNew1" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
          '<div class="field" style="margin-bottom:8px"><label for="pinNew2">PIN（確認）</label><input type="password" id="pinNew2" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
        '</div>' +
        '<button class="btn-primary alt" id="btnPinSet">🔐 PINロックを設定</button>' +
        '<p class="hint">設定すると、次回から予約・設定タブを開くときに4桁PINを求めます。PINは端末内にSHA-256のハッシュで保存され、画面にも送信にも出ません。</p>';
      $('btnPinSet').addEventListener('click', function () {
        var a = $('pinNew1').value.trim(), b = $('pinNew2').value.trim();
        if (!/^\d{4}$/.test(a)) { toast('4桁の数字で入れてね', true); return; }
        if (a !== b) { toast('PINが一致しません', true); return; }
        var salt = String(Date.now()) + Math.random().toString(36).slice(2, 8);
        hashPin(a, salt, function (h) {
          state.lock = { salt: salt, hash: h };
          state.unlocked = true;
          persist(); renderLock();
          toast('PINロックを設定しました');
        });
      });
      return;
    }
    $('lockBody').innerHTML = '' +
      '<div class="banner ok" style="margin-bottom:10px"><span class="ic">🔐</span><div>PINロックは<b>' + (state.unlocked ? '解除中' : '有効') + '</b>です。予約・設定タブを開くときにPINを確認します。</div></div>' +
      '<div class="btn-row"><button class="btn-ghost" id="btnPinLockNow">🔒 今すぐロック</button>' +
      '<button class="btn-ghost" id="btnPinChange">PINを変更</button></div>' +
      '<button class="link-btn" id="btnPinRemove" style="margin-top:8px;color:var(--danger)">PINロックを解除する</button>';
    $('btnPinLockNow').addEventListener('click', function () {
      state.unlocked = false;
      if (state.activeTab === 'trips' || state.activeTab === 'settings') switchTab('watch');
      renderLock(); renderTrips();
      toast('ロックしました');
    });
    $('btnPinChange').addEventListener('click', function () { openPinSheet('change'); });
    $('btnPinRemove').addEventListener('click', function () { openPinSheet('remove'); });
  }

  function renderPrefChips() {
    var p = state.prefs;
    $('prefAirports').innerHTML = ['KIX', 'ITM', 'HND', 'NRT'].map(function (a) {
      var on = (p.airports || []).indexOf(a) !== -1;
      return '<button class="chip' + (on ? ' active' : '') + '" data-prefair="' + a + '">' + AIRPORT_LABEL[a] + '</button>';
    }).join('');
    $('prefAreas').innerHTML = AREA_CHIPS.map(function (c) {
      var on = (p.areas || []).indexOf(c.k) !== -1;
      return '<button class="chip' + (on ? ' active' : '') + '" data-prefarea="' + c.k + '">' + c.l + '</button>';
    }).join('');
    Array.prototype.forEach.call($('prefAirports').querySelectorAll('[data-prefair]'), function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-prefair');
        var arr = state.prefs.airports || [];
        var i = arr.indexOf(a);
        if (i >= 0) arr.splice(i, 1); else arr.push(a);
        state.prefs.airports = arr;
        b.classList.toggle('active');
      });
    });
    Array.prototype.forEach.call($('prefAreas').querySelectorAll('[data-prefarea]'), function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-prefarea');
        var arr = state.prefs.areas || [];
        var i = arr.indexOf(a);
        if (i >= 0) arr.splice(i, 1); else arr.push(a);
        state.prefs.areas = arr;
        b.classList.toggle('active');
      });
    });
    $('prefNights').value = p.nights || '';
    $('prefTime').value = p.time || '';
    $('prefBudget').value = p.budget || '';
  }

  function renderSettings() {
    var g = gateFor('settings');
    var hideSensitive = g !== 'ok';
    ['passCard', 'payCard', 'mileCard', 'lockCard'].forEach(function (id) {
      $(id).classList.toggle('hidden', hideSensitive);
    });
    $('settingsLocked').classList.toggle('hidden', !hideSensitive);
    if (hideSensitive) {
      $('settingsLocked').innerHTML = lockPanelHtml(g, 'settings');
      clearSensitiveDom();
      bindLockPanel();
    } else {
      renderPassport();
      renderCards();
      renderMileage();
      renderLock();
    }
    renderPrefChips();
    renderPayOptions();
    var bytes = 0;
    try { bytes = (localStorage.getItem(STORE_KEY) || '').length; } catch (e) { bytes = 0; }
    $('storageInfo').textContent = 'この端末の保存量：約 ' + Math.max(1, Math.round(bytes / 1024)) + 'KB ／ 監視データ最終更新 ' +
      (FEED.updatedAt ? fmtDate(FEED.updatedAt, true) : '不明');
    $('btnToggleMiles').textContent = state.showMiles ? '番号を隠す' : '番号を表示';
  }

  /* ---------------- シート ---------------- */
  function openSheet(title, html) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    var sheet = $('modal').querySelector('.sheet');
    if (sheet) sheet.scrollTop = 0;
  }
  function closeSheet() {
    $('modal').classList.add('hidden');
    $('sheetBody').innerHTML = '';
    document.body.style.overflow = '';
  }

  /* ---------------- 初期化 ---------------- */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    $('btnShare').addEventListener('click', function () { setShareMode(!state.shareMode); });
    $('btnClose').addEventListener('click', function () {
      closeSheet();
      try {
        if (window.pickle && pickle.widget && typeof pickle.widget.close === 'function') { pickle.widget.close(); return; }
      } catch (e) { /* noop */ }
      try {
        window.parent.postMessage({ type: 'pickle.widget.close' }, '*');
        window.parent.postMessage({ source: 'pickle-widget', action: 'close' }, '*');
      } catch (e2) { /* noop */ }
    });
    $('sheetClose').addEventListener('click', closeSheet);
    $('modal').addEventListener('click', function (ev) { if (ev.target === $('modal')) closeSheet(); });
    $('btnAddDeal').addEventListener('click', openDealForm);
    $('btnAddTrip').addEventListener('click', function () { openTripForm(null); });
    $('btnCopyExpenses').addEventListener('click', copyExpenses);

    // リクエストフォーム
    ['reqDepart', 'reqReturn', 'reqFrom', 'reqTo', 'reqTime', 'reqAirline', 'reqBudget', 'reqMemo', 'reqExpense',
      'reqCity', 'reqCheckIn', 'reqCheckOut', 'reqHotelBudget', 'reqGuests', 'reqChain', 'reqFreeCancel',
      'reqSeat', 'reqBaggage', 'reqCardSel', 'reqConvSel'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', updatePreview);
      el.addEventListener('change', updatePreview);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="reqType"], input[name="reqPolicy"], input[name="reqPay"], input[name="reqKind"]'), function (el) {
      el.addEventListener('change', updatePreview);
    });
    $('btnReqCopy').addEventListener('click', function () {
      var r = readReqForm();
      var saved = saveRequest(r);
      state.editingRequest = saved.id;
      $('reqMode').textContent = '編集中';
      $('btnReqCancel').classList.remove('hidden');
      copyText(saved.text).then(function () {
        saved.status = saved.status === 'draft' ? 'sent' : saved.status;
        persist(); renderRequests();
        toast('依頼文をコピーしました。チャットに貼ってね 📋');
        signal('フライトウォッチで監視リクエストを作成しました：' + PRODUCT_LABEL[r.kind] + '／' +
          (r.kind === 'hotel' ? (r.city || '') + ' ' + requestPeriodText(r) : placeText(r.from) + '→' + placeText(r.to) + '／' + requestPeriodText(r)) +
          '／予算' + yen(r.kind === 'hotel' ? r.hotelBudget : r.budget) +
          '／' + (r.policy === 'auto' ? '自動予約ON（見積書を発行・記録してから確保）' : r.policy === 'quote' ? '見積書を発行して確認後に予約' : '確認カード') +
          '／支払い' + payText(r) + '／座席' + (r.seat || '指定なし') + '／荷物' + (r.baggage || '指定なし') +
          (r.expense ? '／経費計上' : '') + '。チャットに貼られてきたらこの条件で監視を開始してください。');
      }, function () { toast('コピーできませんでした', true); });
    });
    $('btnReqQuote').addEventListener('click', function () {
      var r = readReqForm();
      var saved = saveRequest(r);
      state.editingRequest = saved.id;
      $('reqMode').textContent = '編集中';
      $('btnReqCancel').classList.remove('hidden');
      openQuote({ type: 'request', request: saved });
    });
    $('btnReqSave').addEventListener('click', function () {
      var r = readReqForm();
      var rec = saveRequest(r);
      state.editingRequest = rec.id;
      $('reqMode').textContent = '編集中';
      $('btnReqCancel').classList.remove('hidden');
      toast('下書きを保存しました');
    });
    $('btnReqCancel').addEventListener('click', function () {
      clearReqForm();
      toast('編集をやめました');
    });

    // 設定：パスポート
    $('btnSavePass').addEventListener('click', savePassport);
    $('passNumber').addEventListener('focus', function () {
      if (this.getAttribute('data-masked')) {
        this.value = state.passport.number || '';
        this.removeAttribute('data-masked');
        state.showPass = true;
        $('btnTogglePass').textContent = '番号を隠す';
      }
    });
    $('btnTogglePass').addEventListener('click', function () {
      state.showPass = !state.showPass;
      renderPassport();
    });

    // 設定：支払い方法
    $('btnAddCard').addEventListener('click', addCard);
    $('newCardLast4').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    $('btnSaveConv').addEventListener('click', function () {
      state.payment.conv.store = $('convStore').value;
      state.payment.conv.memo = $('convMemo').value.trim();
      persist(); renderCards(); updatePreview();
      toast('コンビニ設定を保存しました');
    });

    // 設定：マイレージ
    $('btnAddMile').addEventListener('click', function () {
      var num = $('mileNumber').value.trim();
      if (!num) { toast('会員番号を入れてね', true); return; }
      state.mileage.unshift({ id: uid('m'), program: $('mileProgram').value, number: num, memo: $('mileMemo').value.trim() });
      persist();
      $('mileNumber').value = '';
      $('mileMemo').value = '';
      renderMileage();
      toast('会員番号を追加しました');
    });
    $('btnToggleMiles').addEventListener('click', function () {
      state.showMiles = !state.showMiles;
      renderMileage();
      $('btnToggleMiles').textContent = state.showMiles ? '番号を隠す' : '番号を表示';
    });

    // 設定：希望条件
    $('btnSavePrefs').addEventListener('click', function () {
      state.prefs.nights = $('prefNights').value;
      state.prefs.time = $('prefTime').value;
      state.prefs.budget = Number($('prefBudget').value) || '';
      persist();
      renderPrefsStrip(); renderDeals();
      toast('希望条件を保存しました');
    });

    // 設定：バックアップ・リセット
    $('btnBackup').addEventListener('click', function () {
      var data = {
        marks: state.marks, userDeals: state.userDeals, trips: state.trips, requests: state.requests, quotes: state.quotes,
        passport: state.passport, payment: state.payment, mileage: state.mileage, prefs: state.prefs
      };
      copyText(JSON.stringify(data, null, 1)).then(function () { toast('バックアップをコピーしました（大事に保管してね）'); },
        function () { toast('コピーできませんでした', true); });
    });
    $('btnReset').addEventListener('click', function () {
      if (!window.confirm('この端末に保存したメモ・パスポート・会員番号・予約・領収書・見積書・リクエスト・PINをすべて消します。よろしいですか？（監視データ自体は消えません）')) return;
      state.marks = {}; state.userDeals = []; state.requests = []; state.passport = {};
      state.payment = { cards: [], defaultId: '', conv: { store: CONV_STORES[0], memo: '' } };
      state.mileage = []; state.quotes = [];
      state.prefs = { airports: [], areas: [], nights: '', time: '', budget: '' };
      state.lock = { salt: '', hash: '' }; state.unlocked = true; state.revealed = {};
      state.trips = feedTrips.map(function (t) { return Object.assign({}, t); });
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ }
      persist();
      renderDeals(); renderFilters(); renderTrips(); renderSettings(); renderRequests();
      toast('自分の入力を消しました');
    });
  }

  function init() {
    load();
    initData();
    bind();
    if (!inWidget()) {
      $('btnClose').classList.add('hidden');
    }
    setShareModeInit();
    renderPrefsStrip();
    renderFilters();
    renderDeals();
    renderQuickLinks();
    renderTrips();
    clearReqForm();
    renderRequests();
    updateNewDot();
    var upd = FEED.updatedAt ? parseISO(FEED.updatedAt) : null;
    $('updatedAt').textContent = upd
      ? '最終更新 ' + fmtDate(FEED.updatedAt, true) + ' ' + ('0' + upd.getHours()).slice(-2) + ':' + ('0' + upd.getMinutes()).slice(-2) + ' ／ 監視 ' + allDeals().length + '件'
      : '監視 ' + allDeals().length + '件';
  }
  function setShareModeInit() {
    if (state.shareMode) {
      $('btnShare').classList.add('on');
      $('shareBanner').classList.remove('hidden');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
