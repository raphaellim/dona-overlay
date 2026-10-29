const EFFECT_RULES={star:100000,diamond:300000};if(new URLSearchParams(location.search).get("demo")==="1")window.overlay3Targets=[{name:"국고",group:"other"}];function makeRow(donor){const amount=Number(donor.amount)||0;const tier=amount>=EFFECT_RULES.diamond?'diamond':amount>=EFFECT_RULES.star?'star':'';
 const row=document.createElement('div');row.className='row active '+tier;
 const badge=document.createElement('span');badge.className='badge';badge.setAttribute('aria-hidden','true');
 const icon=document.createElement('span');icon.className='icon';if(tier==='diamond')icon.innerHTML='<svg viewBox="0 1 24 24" aria-hidden="true"><path fill="#72d8ff" d="M6 4h12l5 6-11 12L1 10z"/><path fill="#c5f2ff" d="M6 4l6 6H1zm12 0l-6 6h11z"/><path fill="#39aee9" d="M1 10h11v12zm11 0h11L12 22z"/><path fill="#91e9ff" d="M6 4h12l-6 6z"/></svg>';else if(tier==='star')icon.innerHTML='<svg viewBox="0 -0.5 24 24" aria-hidden="true"><path fill="#ffd96a" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2l-5-4.9 6.9-1z"/></svg>';else icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4DE2B1" d="M12 21S2 14.7 2 7.8A5.3 5.3 0 0 1 12 5a5.3 5.3 0 0 1 10 2.8C22 14.7 12 21 12 21Z"/></svg>';badge.append(icon);
 if(tier){for(const side of ['a','b']){const spark=document.createElement('span');spark.className='spark '+side;badge.append(spark);}}
 const name=document.createElement('span');name.className='name';name.title=donor.name;for(const letter of Array.from(String(donor.name))){const glyph=document.createElement('span');glyph.className='account-glyph'+(letter==='＊'?' account-mask-star':'');glyph.textContent=letter;name.append(glyph);}const length=Array.from(String(donor.name)).length;if(length>4)name.style.setProperty('font-size',Math.max(12,26*4/length)+'px','important');
 const total=document.createElement('span');total.className='amount';total.textContent=amount.toLocaleString('ko-KR')+'';total.dataset.baseSize=String(total.textContent.length>9?25*9/total.textContent.length:25);total.style.setProperty('font-size',total.dataset.baseSize+'px','important');
 row.append(badge,name,total);return row;
};window.overlay3MakeRow=makeRow;
window.overlay3MaskAccountName=value=>{const letters=Array.from(String(value||'익명').trim());if(letters.length>1)letters[1]='＊';return letters.join('');};
window.overlay3CreatorName=value=>{const text=Array.from(String(value||'익명').trim()).slice(0,4).join('');const name=document.createElement('span');name.className='o3-rank-name';name.textContent=text;return name.outerHTML;};

    if (new URLSearchParams(location.search).get("debug") === "1") { console.log("[overlay-debug] overlay.html loaded", location.href); }
    let latestSettingsForTimer = null;
    let showCreatorDonations = true;let latestOverlayCreators=[];
    let mission30SoundPlayed = false;
    let missionCountdownLastSec = null;
    (() => {

      const API_SUMMARY = "/api/overlay-state";
      const API_SUMMARY_FALLBACK = "/api/summary";
      const API_SETTINGS = "/api/settings";
      const PARAMS = new URLSearchParams(location.search);
      const ACCESS_TOKEN = PARAMS.get("token") || "";
      const STATION_SLUG = PARAMS.get("station") || "default";
      const IS_MONITOR = PARAMS.get("monitor") === "1";
      const DEBUG_MODE = PARAMS.get("debug") === "1";

      function debugLog(...args) {
        if (!DEBUG_MODE) return;

        // F12 Console 전용 로그
        try {
          console.log("[overlay-debug]", ...args);
        } catch (e) { }

        // 화면 디버그 패널도 있으면 같이 출력
        const panel = document.getElementById("debugPanel");
        if (!panel) return;
        panel.style.display = "block";
        const line = document.createElement("div");
        line.textContent = "[" + new Date().toLocaleTimeString() + "] " + args.map(v => {
          try { return typeof v === "object" ? JSON.stringify(v) : String(v); }
          catch (e) { return String(v); }
        }).join(" ");
        panel.prepend(line);
        while (panel.children.length > 80) panel.removeChild(panel.lastChild);
      }

      if (DEBUG_MODE) {
        console.log("[overlay-debug] debug mode ON", {
          station: STATION_SLUG,
          monitor: IS_MONITOR,
          tokenExists: !!ACCESS_TOKEN,
          href: location.href
        });
      }

      window.__overlayDebug = () => {
        const box = document.getElementById("topSlideBox");
        const cs = box ? getComputedStyle(box) : null;
        const info = {
          station: STATION_SLUG,
          bodyClass: document.body.className,
          topSlideBoxExists: !!box,
          topSlideClass: box?.className,
          topSlideDisplay: cs?.display,
          topSlideWidth: cs?.width,
          topSlideHeight: cs?.height,
          topSlideHtml: box?.innerHTML?.slice(0, 300)
        };
        console.log("[overlay debug]", info);
        debugLog("manual debug", info);
        return info;
      };

      const $accountBox = document.getElementById("accountBox");
      const $noticeBox = document.getElementById("noticeBox");
      const $creatorBox = document.getElementById("creatorBox");

      const $karaokeBox = document.getElementById("karaokeBox");
      const $karaokeTitleText = document.getElementById("karaokeTitleText");
      const $karaokeCurrentText = document.getElementById("karaokeCurrentText");
      const $karaokeNoticeText = document.getElementById("karaokeNoticeText");
      const $karaokeQueueList = document.getElementById("karaokeQueueList");
      const $karaokeCoinText = document.getElementById("karaokeCoinText");
      const $karaokeTickerText = document.getElementById("karaokeTickerText");

      const $fundingBox = document.getElementById("fundingBox");
      const $broadcastTimerBox = document.getElementById("broadcastTimerBox");
      const $broadcastTimerValue = document.getElementById("broadcastTimerValue");
      const broadcastStartedAt = Date.now();
      const $noticeText = document.getElementById("noticeText");
      const $noticeTitleText = document.getElementById("noticeTitleText");
      const $list = document.getElementById("creatorList");
      const $track = document.getElementById("rollerTrack");

      let rollingItems = [];
      let rollingIndex = 0;
      let rollingTimer = null;
      let enabledPresets = [];
      const defaultSettings = {
        noticeTitle: "공지",
        notice: "",
        noticeColors: ["#ffffff", "#ffe066", "#5ecbff", "#ffb4ca", "#ff4d5e"],
        overlaySections: { account: true, notice: false, creators: true, media: true },
        soundRules: {
          enabled: true,
          defaultSound: "alert.mp3",
          amountRules: [
            { title: "계좌 1만원 미만", min: 1, max: 9999, sound: "account_small.mp3" },
            { title: "계좌 1만원 이상", min: 10000, max: 49999, sound: "account_mid.mp3" },
            { title: "계좌 5만원 이상", min: 50000, max: 99999, sound: "account_big.mp3" },
            { title: "계좌 10만원 이상", min: 100000, max: 0, sound: "account_super.mp3" }
          ]
        },
        creators: [],
        presets: [
          { id: "smoke", enabled: true, title: "펴피지마", plusName: "흡연", minusName: "금연" },
          { id: "food", enabled: true, title: "먹먹마", plusName: "먹어", minusName: "먹지마" }
        ]
      };

      const demoData = {
        settings: {
          ...defaultSettings,
          broadcastLiveData: {live:true},
          allowanceData:{balance:30000},
          fundingData:{items:[{title:"방송 미션 펀딩",current:620000,target:1000000},{title:"다음 미션",current:10000,target:50000}]},
          notice: "오늘 룰 확인하고 후원해주세요",
          overlaySections: { account: true, notice: true, creators: true, funding:true, karaoke:true, allowance:true, media: true }
        },
        accountDonors: [{ donor: "열려", amount: 36000 }, { donor: "이잉", amount: 123400 }],
        creators: [{creator:"빵떠기",total:619600},{creator:"또영이",total:362000},{creator:"국고",total:30000}],
        donations: []
      };

      if(new URLSearchParams(location.search).get('appearancePreview')==='1'){
        window.overlay3Presentation={broadcastMode:'solo',targets:[{name:'빵떠기'}],selectedSections:['account','notice','funding','allowance','presets']};
        demoData.settings.notice='10월 아침방송 미션중\n10/31까지\n오전 8시 방송 시작\n빵디단 함께해요';
        demoData.settings.allowanceData={balance:50000};demoData.settings.fundingData={items:[{id:'preview',title:'단풍펀딩',current:60,target:150,color:'#537e98'}]};
        demoData.settings.overlaySections={account:true,notice:true,funding:true,allowance:true,presets:true,creators:false,media:false};
        demoData.creators=[{creator:'빵떠기',presetNets:{smoke:{presetId:'smoke',plus:2,minus:0},food:{presetId:'food',plus:0,minus:3}}}];
      }
      function num(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
      function displayManAmount(won) {
        const v = Math.trunc(num(won) / 1000) / 10;
        return v.toLocaleString('ko-KR',{maximumFractionDigits:1});
      }

      function displayAmount(won) {
        return Math.floor(num(won)).toLocaleString("ko-KR");
      }
      function normalizeName(v) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
      function escapeHtml(str) { return String(str).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch])); }
      function formatCreatorName(name) {
        const arr = Array.from(String(name || "").trim());
        if (arr.length >= 3) return arr.slice(0, 3).join("");
        if (arr.length === 2) return arr.join(" ");
        if (arr.length === 1) return arr[0] + "  ";
        return "익 명";
      }
      function getEnabledPresets(settings) {
        const presets = settings && Array.isArray(settings.presets) ? settings.presets : [];
        return presets.filter(p => p && p.enabled !== false);
      }


      function applyLuxuryTheme(settings) {
        const st = settings?.stationStyle || {};
        const theme = String(st.luxuryTheme || new URLSearchParams(location.search).get("theme") || "gold").trim().toLowerCase();
        document.body.classList.remove("theme-gold", "theme-pink", "theme-blue", "theme-green");
        document.body.classList.add("theme-" + (["gold","pink","blue","green"].includes(theme) ? theme : "gold"));
      }

      function applyStationStyle(settings) {
        window.OverlayAppearance?.apply(settings?.stationStyle?.compactPreview);
        const st = settings?.stationStyle || {};
        const root = document.documentElement;
        const set = (name, value) => {
          if (value !== undefined && value !== null && String(value).trim() !== "") {
            root.style.setProperty(name, String(value));
          }
        };

        set("--style-box-border", st.boxBorderColor);
        set("--style-box-bg-top", st.boxBgTop);
        set("--style-box-bg-bottom", st.boxBgBottom);
        set("--style-account-title-color", st.accountTitleColor);
        set("--style-notice-title-color", st.noticeTitleColor);
        set("--style-funding-title-color", st.fundingTitleColor);
        set("--style-karaoke-title-color", st.karaokeTitleColor);
        set("--style-content-color", st.contentColor);
        set("--style-notice-content-color", st.noticeContentColor);
        set("--style-funding-content-color", st.fundingContentColor);
        set("--style-karaoke-content-color", st.karaokeContentColor);
        set("--style-karaoke-notice-color", st.karaokeNoticeColor);
        set("--style-karaoke-current-color", st.karaokeCurrentColor);
        set("--style-karaoke-queue-color", st.karaokeQueueColor);
        set("--style-karaoke-coin-color", st.karaokeCoinColor);
        set("--style-karaoke-donor-color", st.karaokeDonorColor);
        set("--style-karaoke-heart-color", st.karaokeHeartColor);
        set("--style-funding-bar", st.fundingBarColor);
        if (st.overlayWidth) set("--overlay-w", Number(st.overlayWidth) + "px");
        if (st.overlayTop !== undefined) set("--top", Number(st.overlayTop) + "px");
        if (st.overlayRight !== undefined) set("--right", Number(st.overlayRight) + "px");
        if (st.overlayGap !== undefined) set("--style-overlay-gap", Number(st.overlayGap) + "px");
        if (st.boxRadius !== undefined) set("--style-box-radius", Number(st.boxRadius) + "px");
        // if(st.topSlideHeight !== undefined) set("--top-slide-height", Number(st.topSlideHeight) + "px");
        if (st.topSlideOpacity !== undefined) set("--top-slide-opacity", Number(st.topSlideOpacity));
        if (st.karaokeNoticeSize) set("--style-karaoke-notice-size", Number(st.karaokeNoticeSize) + "px");
        if (st.karaokeCurrentSize) set("--style-karaoke-current-size", Number(st.karaokeCurrentSize) + "px");
        if (st.karaokeQueueSize) set("--style-karaoke-queue-size", Number(st.karaokeQueueSize) + "px");
        if (st.karaokeCoinSize) set("--style-karaoke-coin-size", Number(st.karaokeCoinSize) + "px");
        document.body.classList.toggle("box-group-single", st.boxGroupMode === "single");
        set("--style-vip-bg1", st.vipAccountBg1);
        set("--style-vip-bg2", st.vipAccountBg2);
        if (st.vipAccountThreshold !== undefined) set("--style-vip-threshold", Number(st.vipAccountThreshold));

        if (st.accountTitleSize) set("--style-account-title-size", Number(st.accountTitleSize) + "px");
        if (st.noticeTitleSize) set("--style-notice-title-size", Number(st.noticeTitleSize) + "px");
        if (st.fundingTitleSize) set("--style-funding-title-size", Number(st.fundingTitleSize) + "px");
        if (st.karaokeTitleSize) set("--style-karaoke-title-size", Number(st.karaokeTitleSize) + "px");
        if (st.contentFontSize) set("--style-content-size", Number(st.contentFontSize) + "px");
        if (st.creatorContentSize) set("--style-creator-content-size", Number(st.creatorContentSize) + "px");
        if (st.accountRollFontSize) set("--style-account-roll-size", Number(st.accountRollFontSize) + "px");
        if (st.alertFontSize) set("--style-alert-size", Number(st.alertFontSize) + "px");
      }

      function getOverlaySections(settings) {
        const s = settings?.overlaySections || {};
        return {
          account: s.account !== false,
          notice: s.notice === true,
          allowance: s.allowance === true,
          creators: s.creators !== false,
          creatorDonations: s.creatorDonations !== false,
          karaoke: s.karaoke === true,
          funding: s.funding === true,
          broadcastTimer: s.broadcastTimer === true,
          media: s.media !== false
        };
      }





      let fundingRollIndex = 0;
      let topSlideTimer = null;
      let topSlideIndex = 0;
      let lastTopSlideSignature = null;
      let topSlideGeneration = 0;
      let topSlideSwitching = false;
      let topSlideMedia = [];
      let topSlideIntervalMs = 3500;

      function isTopSlideVideo(src) {
        return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(src || ""));
      }

      function applyTopSlideRatio(el) {
        if (!el) return;
        if (el.tagName === "IMG" && el.naturalWidth && el.naturalHeight) {
          document.documentElement.style.setProperty("--active-slide-ratio", el.naturalWidth + " / " + el.naturalHeight);
        } else if (el.tagName === "VIDEO" && el.videoWidth && el.videoHeight) {
          document.documentElement.style.setProperty("--active-slide-ratio", el.videoWidth + " / " + el.videoHeight);
        }
      }

      function disposeTopSlideElement(el) {
        if (!el) return;
        try {
          if (el.tagName === "VIDEO") {
            el.pause();
            el.removeAttribute("src");
            el.querySelectorAll("source").forEach(source => source.removeAttribute("src"));
            el.load();
          } else if (el.tagName === "IMG") {
            el.removeAttribute("src");
          }
        } catch (_) { }
        try { el.remove(); } catch (_) { }
      }

      function releaseTopSlideMedia(box) {
        if (topSlideTimer) {
          clearInterval(topSlideTimer);
          topSlideTimer = null;
        }
        topSlideGeneration += 1;
        topSlideSwitching = false;
        if (box) Array.from(box.children).forEach(disposeTopSlideElement);
        if (box) box.replaceChildren();
        topSlideIndex = 0;
        topSlideMedia = [];
      }

      function createTopSlideElement(src, idx, active) {
        let el;
        if (isTopSlideVideo(src)) {
          el = document.createElement("video");
          el.muted = true;
          el.playsInline = true;
          el.loop = true;
          el.preload = "metadata";
        } else {
          el = document.createElement("img");
          el.alt = "slide";
          el.decoding = "async";
          el.loading = "eager";
          try { el.fetchPriority = active ? "high" : "low"; } catch (_) { }
        }
        el.className = (el.tagName === "VIDEO" ? "top-slide-video" : "top-slide-img") + (active ? " active" : "");
        el.dataset.slideIndex = String(idx);
        el.dataset.debugSlide = String(idx);
        el.src = src;
        return el;
      }

      function waitTopSlideReady(el) {
        if (!el) return Promise.resolve(false);
        if (el.tagName === "IMG" && el.complete && el.naturalWidth) return Promise.resolve(true);
        if (el.tagName === "VIDEO" && el.readyState >= 1) return Promise.resolve(true);
        return new Promise(resolve => {
          let done = false;
          const finish = ok => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            el.removeEventListener("load", onOk);
            el.removeEventListener("loadedmetadata", onOk);
            el.removeEventListener("error", onErr);
            resolve(ok);
          };
          const onOk = () => finish(true);
          const onErr = () => finish(false);
          const timer = setTimeout(() => finish(false), 10000);
          el.addEventListener("load", onOk, { once: true });
          el.addEventListener("loadedmetadata", onOk, { once: true });
          el.addEventListener("error", onErr, { once: true });
        });
      }

      async function ensureTopSlideLoaded(box, idx, generation, active = false) {
        if (!box || generation !== topSlideGeneration || !topSlideMedia.length) return null;
        let el = box.querySelector('[data-slide-index="' + idx + '"]');
        if (!el) {
          el = createTopSlideElement(topSlideMedia[idx], idx, active);
          box.appendChild(el);
        }
        const ok = await waitTopSlideReady(el);
        if (generation !== topSlideGeneration || !el.isConnected) return null;
        if (!ok) debugLog("slide media load delayed/error", topSlideMedia[idx]);
        return el;
      }

      function playTopSlideElement(el) {
        if (!el) return;
        applyTopSlideRatio(el);
        if (el.tagName === "VIDEO") {
          try { el.currentTime = 0; } catch (_) { }
          el.play().catch(() => { });
        }
      }

      function preloadFollowingSlide(box, generation) {
        if (generation !== topSlideGeneration || topSlideMedia.length <= 1) return;
        const idx = (topSlideIndex + 1) % topSlideMedia.length;
        // 현재 + 다음 1개만 유지합니다. 전체 슬라이드를 한 번에 다운로드하지 않습니다.
        ensureTopSlideLoaded(box, idx, generation, false).catch(() => { });
      }

      async function advanceTopSlide(box, generation) {
        if (topSlideSwitching || generation !== topSlideGeneration || topSlideMedia.length <= 1) return;
        topSlideSwitching = true;
        try {
          const nextIndex = (topSlideIndex + 1) % topSlideMedia.length;
          const next = await ensureTopSlideLoaded(box, nextIndex, generation, false);
          if (!next || generation !== topSlideGeneration) return;

          const current = box.querySelector(".top-slide-img.active,.top-slide-video.active");
          next.classList.add("active");
          playTopSlideElement(next);
          topSlideIndex = nextIndex;

          if (current && current !== next) {
            current.classList.remove("active");
            if (current.tagName === "VIDEO") {
              try { current.pause(); } catch (_) { }
            }
            setTimeout(() => {
              if (generation !== topSlideGeneration) return;
              if (current.isConnected && !current.classList.contains("active")) disposeTopSlideElement(current);
              // 전환이 끝난 뒤에 다음 한 장만 미리 받습니다.
              preloadFollowingSlide(box, generation);
            }, 850);
          } else {
            preloadFollowingSlide(box, generation);
          }
        } finally {
          topSlideSwitching = false;
        }
      }

      function renderTopSlide(settings) {
        const box = document.getElementById("topSlideBox");
        if (!box) return;

        const st = settings?.stationStyle || {};
        const sections = getOverlaySections(settings);
        const enabled = sections.media !== false;

        const normalizeSlideSrc = item => {
          if (!item) return "";
          if (typeof item === "string") return item.trim();
          if (typeof item === "object") return String(item.url || item.src || item.path || item.file || "").trim();
          return "";
        };
        const splitTextList = value => String(value || "").split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
        const media = [];
        [
          st.topSlideImages, st.topSlideItems, st.mediaSlides, st.slideImages, st.slides,
          settings?.media?.slides, settings?.media?.items, settings?.topSlideImages, settings?.mediaSlides
        ].forEach(list => {
          const values = Array.isArray(list) ? list.map(normalizeSlideSrc).filter(Boolean) : (typeof list === "string" ? splitTextList(list) : []);
          values.forEach(src => { if (!media.includes(src)) media.push(src); });
        });
        if (Array.isArray(st.mediaItems)) {
          st.mediaItems.map(normalizeSlideSrc).filter(Boolean).forEach(src => { if (!media.includes(src)) media.push(src); });
        }

        const interval = Math.max(800, Number(st.topSlideInterval || 3500));
        const slideSignature = JSON.stringify({ enabled, media, interval });
        // 후원/공지/타이머 데이터만 바뀌었으면 이미지 DOM과 다운로드 상태를 그대로 유지합니다.
        if (slideSignature === lastTopSlideSignature) return;
        lastTopSlideSignature = slideSignature;

        releaseTopSlideMedia(box);
        document.documentElement.style.removeProperty("--active-slide-ratio");

        if (!enabled || !media.length) {
          box.classList.add("hidden");
          return;
        }

        topSlideMedia = media;
        topSlideIntervalMs = interval;
        topSlideIndex = 0;
        const generation = topSlideGeneration;
        box.classList.remove("hidden");

        // 첫 장만 즉시 요청하고, 로드된 뒤 다음 한 장만 선로딩합니다.
        const first = createTopSlideElement(topSlideMedia[0], 0, true);
        box.appendChild(first);
        waitTopSlideReady(first).then(() => {
          if (generation !== topSlideGeneration || !first.isConnected) return;
          playTopSlideElement(first);
          preloadFollowingSlide(box, generation);
        }).catch(() => { });

        if (topSlideMedia.length > 1) {
          topSlideTimer = setInterval(() => advanceTopSlide(box, generation), topSlideIntervalMs);
        }
      }

      let o3FundingTimer=null,o3FundingSignature='',o3FundingIndex=0;
      function o3Heading(el,text){if(!el)return;const label=document.createElement('span');label.className='o3-heading-label';label.textContent=String(text||'');const line=document.createElement('span');line.className='o3-heading-line';line.setAttribute('aria-hidden','true');el.replaceChildren(label,line);}
      function syncO3Headings(){for(const id of ['noticeBox','karaokeBox','creatorBox']){const el=document.querySelector('#'+id+' .notice-title,#'+id+' .karaoke-title,#'+id+' .creator-title');if(el&&!el.querySelector('.o3-heading-line'))o3Heading(el,el.textContent);}}
      function renderFunding(settings) {
        if(!$fundingBox)return;
        const items=(settings?.fundingData?.items||[]).filter(f=>f.enabled!==false);
        const sig=JSON.stringify(items),el=$fundingBox.querySelector('.funding-value'),heading=$fundingBox.querySelector('.funding-title');
        if(!el)return;
        if(sig===o3FundingSignature&&el.querySelector('.o3-funding'))return;
        o3FundingSignature=sig;clearInterval(o3FundingTimer);o3FundingTimer=null;o3FundingIndex=0;
        const draw=()=>{
          const f=items[o3FundingIndex%Math.max(1,items.length)];
          o3Heading(heading,'펀딩현황');if(items.length>1){const page=document.createElement('small');page.className='funding-page';page.textContent=(o3FundingIndex%items.length+1)+' / '+items.length;heading.append(page);}
          if(!f){el.innerHTML='<div class="o3-funding"><div class="o3-funding-detail">등록된 펀딩 없음</div></div>';return;}
          const current=Math.max(0,num(f.current)),goal=Math.max(0,num(f.target));
          const percent=goal>0?Math.max(0,current/goal*100):0,bar=Math.min(100,percent),left=Math.max(0,goal-current);
          el.innerHTML='<div class="o3-funding"><div class="o3-funding-meter" role="progressbar" data-funding-color="'+escapeHtml(/^#[0-9a-f]{6}$/i.test(f.color||'')?f.color:'')+'" data-funding-key="'+escapeHtml(String(f.id||f.title||'펀딩'))+'" aria-label="'+escapeHtml(f.title||'펀딩')+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+bar+'"><i class="o3-funding-fill" style="width:'+bar+'%"></i><div class="o3-funding-label"><strong>'+escapeHtml(f.title||'펀딩')+'</strong><span class="funding-ratio"><b>'+escapeHtml(displayAmount(current))+'</b><em> / '+escapeHtml(displayAmount(goal))+'</em></span></div></div><div class="o3-funding-detail">'+'<span>'+(goal>0?'달성률 '+Math.round(percent)+'%':'목표 미설정')+'</span><span>'+(goal>0?(current>=goal?'목표 달성':'목표까지 '+escapeHtml(displayAmount(left))):'')+'</span>'+'</div></div>';
        };
        draw();if(items.length>1)o3FundingTimer=setInterval(()=>{if(!document.hidden&&getComputedStyle($fundingBox).display!=='none'){o3FundingIndex++;draw();}},4000);
      }
      window.addEventListener('pagehide',()=>{clearInterval(o3FundingTimer);o3FundingTimer=null;o3FundingSignature='';});
      window.addEventListener('pageshow',()=>{if(latestSettingsForTimer)renderFunding(latestSettingsForTimer);});

      const studioMissionClock = new MissionTimerClock.Clock();
      function timerBaseMs(settings) {
        studioMissionClock.apply({broadcastId:settings?.broadcast?.id||settings?.broadcastId||studioMissionClock.broadcast||'',broadcastTimerData:settings?.broadcastTimerData});
        return studioMissionClock.ms();
      }
      window.addEventListener('collection:changed',e=>{if(e.detail?.topic==='timer'&&e.detail.payload?.broadcastTimerData){studioMissionClock.apply(e.detail.payload);if(latestSettingsForTimer)latestSettingsForTimer.broadcastTimerData=e.detail.payload.broadcastTimerData;updateBroadcastTimer();}});

      function coinLabel(type) {
        return type === "full" ? "완곡" : type === "special" ? "스페셜" : "1절";
      }

      function renderKaraoke(settings) {
        const data = settings?.karaokeData || {};
        const users = Array.isArray(data.users) ? data.users : [];
        const songs = Array.isArray(data.songs) ? data.songs.filter(s => s.status !== "삭제" && s.status !== "완료") : [];

        if ($karaokeTitleText) $karaokeTitleText.textContent = data.title || "노래방 공지 알림판";
        if ($karaokeNoticeText) $karaokeNoticeText.textContent = data.notice || data.ticker || "노래문의필수";

        const songMarquee = (title) => {
          const safeTitle = escapeHtml(title || "");
          return `<span class="karaoke-song-title-wrap"><span class="karaoke-song-title-text">${safeTitle}</span></span>`;
        };

        const running = songs.find(s => s.status === "진행");
        if ($karaokeCurrentText) {
          $karaokeCurrentText.innerHTML = running
            ? `<b>진행중<span class="karaoke-heart">♥</span></b><em>${escapeHtml(running.nick)}</em>${songMarquee(running.title)}`
            : `<b>진행중<span class="karaoke-heart">♥</span></b>`;
        }

        if ($karaokeQueueList) {
          const waitQueue = songs.filter(s => s.status === "대기").slice(0, 6);
          const holdQueue = songs.filter(s => s.status === "보류").slice(0, 6);

          const waitHtml = waitQueue.length
            ? waitQueue.map((s, idx) => `
          <div class="karaoke-song-row">
            <span class="karaoke-order">${idx + 1}번</span>
            <em class="karaoke-donor">${escapeHtml(s.nick)}</em>
            ${songMarquee(s.title)}
          </div>
        `).join("")
            : `<div class="queue-empty">예약 없음</div>`;

          const holdHtml = holdQueue.length
            ? `<div class="karaoke-hold-title">보류곡</div>` + holdQueue.map((s, idx) => `
          <div class="karaoke-song-row hold">
            <span class="karaoke-order">보류${idx + 1}</span>
            <em class="karaoke-donor">${escapeHtml(s.nick)}</em>
            ${songMarquee(s.title)}
          </div>
        `).join("")
            : "";

          $karaokeQueueList.innerHTML = waitHtml + holdHtml;
        }

        if ($karaokeTickerText) {
          const coinText = users.length
            ? users.map(u => {
              const c = u.coins || {};
              const parts = [];
              if (Number(c.verse || 0) > 0) parts.push(`1절${Number(c.verse || 0)}`);
              if (Number(c.full || 0) > 0) parts.push(`완곡${Number(c.full || 0)}`);
              if (Number(c.special || 0) > 0) parts.push(`스페셜${Number(c.special || 0)}`);
              return parts.length ? `${u.nick}-${parts.join("/")}` : "";
            }).filter(Boolean).join(" / ")
            : "코인보유 없음";
          $karaokeTickerText.textContent = coinText || "코인보유 없음";
        }
      }


      let noticeStepTimer=null,noticeStepSignature='';
      function stopNoticeSteps(){clearTimeout(noticeStepTimer);noticeStepTimer=null;}
      window.addEventListener('pagehide',()=>{stopNoticeSteps();noticeStepSignature='';});
      window.addEventListener('pageshow',()=>{if(latestSettingsForTimer)renderNotice(latestSettingsForTimer);});
      function renderNotice(settings) {
        const titleEl = document.querySelector(".notice-title");
        const textEl = document.querySelector(".notice-text");
        if (!titleEl || !textEl) return;

        const rawNotice = settings?.notice;
        let title = "공지사항";
        let text = "";
        let colors = [];

        if (typeof rawNotice === "string") {
          text = rawNotice;
          title = String(settings?.noticeTitle || settings?.notice_title || "공지사항");
          colors = Array.isArray(settings?.noticeColors) ? settings.noticeColors : [];
        } else if (rawNotice && typeof rawNotice === "object") {
          title = String(rawNotice.title ?? settings?.noticeTitle ?? settings?.notice_title ?? "공지사항");
          text = String(rawNotice.text ?? rawNotice.content ?? settings?.noticeText ?? settings?.notice_text ?? "");
          colors = Array.isArray(rawNotice.colors)
            ? rawNotice.colors
            : (Array.isArray(settings?.noticeColors) ? settings.noticeColors : []);
        } else {
          title = String(settings?.noticeTitle || settings?.notice_title || "공지사항");
          text = String(settings?.noticeText || settings?.notice_text || "");
          colors = Array.isArray(settings?.noticeColors) ? settings.noticeColors : [];
        }

        text = String(text || "").replace(/\\n/g, "\n");
        titleEl.textContent = title.trim() || "공지사항";

        if (!text.trim()) {
          stopNoticeSteps();noticeStepSignature="";textEl.classList.remove("rolling");
          textEl.innerHTML = "";
          return;
        }

        const lines = text.split(/\r?\n/).filter(line => String(line).trim() !== "");
        const noticeAligns = Array.isArray(settings?.noticeAligns) ? settings.noticeAligns : [];
        const lineHtml = lines.map((line, idx) => {
          let text = String(line || "");
          let align = String(noticeAligns[idx] || "left").toLowerCase();

          const tagMatch = text.match(/^\s*\[(left|center|right|왼쪽|가운데|오른쪽)\]\s*/i);
          if (tagMatch) {
            const tag = tagMatch[1].toLowerCase();
            align = tag === "왼쪽" ? "left" : tag === "가운데" ? "center" : tag === "오른쪽" ? "right" : tag;
            text = text.replace(tagMatch[0], "");
          }

          if (!["left", "center", "right"].includes(align)) align = "left";

          const rawColor = String(colors[idx] || "");
          let color = rawColor;
          if(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(rawColor)){
            let hex=rawColor.slice(1);if(hex.length===3)hex=hex.split('').map(x=>x+x).join('');
            const channels=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
            color='#'+channels.map(x=>Math.round(x*.75+255*.25).toString(16).padStart(2,'0')).join('');
          }
          const style = color ? ` style="color:${escapeHtml(color)} !important"` : "";
          return `<span class="notice-line notice-align-${align}"${style}>${escapeHtml(text)}</span>`;
        }).join("");

        // Avoid restarting the hold whenever the overlay receives an unchanged state.
        if(noticeStepSignature===lineHtml)return;
        noticeStepSignature=lineHtml;stopNoticeSteps();
        if (lines.length > 4) {
          textEl.classList.add("rolling");
          textEl.innerHTML='<div class="notice-roll-window"><div class="notice-roll-track">'+lineHtml+lineHtml+'</div></div>';
          const track=textEl.querySelector('.notice-roll-track');let index=0;
          const hold=()=>{noticeStepTimer=setTimeout(()=>{
            if(!track.isConnected)return;
            const rowHeight=track.firstElementChild.getBoundingClientRect().height;
            track.style.transition='transform 250ms ease-in-out';
            track.style.transform='translateY(-'+(++index*rowHeight)+'px)';
            noticeStepTimer=setTimeout(()=>{
              if(index===lines.length){index=0;track.style.transition='none';track.style.transform='translateY(0)';}
              hold();
            },250);
          },1500);};hold();
        } else {
          textEl.classList.remove("rolling");
          textEl.innerHTML = lineHtml;
        }
      }

      function applySections(settings) {
        const sections = getOverlaySections(settings);

        if ($broadcastTimerBox) $broadcastTimerBox.classList.toggle("hidden", !sections.broadcastTimer);
        if ($accountBox) $accountBox.classList.toggle("hidden", !sections.account);
        if ($fundingBox) $fundingBox.classList.toggle("hidden", !sections.funding);
        if ($noticeBox) $noticeBox.classList.toggle("hidden", !sections.notice);
        if ($karaokeBox) $karaokeBox.classList.toggle("hidden", !sections.karaoke);
        if ($creatorBox) $creatorBox.classList.toggle("hidden", !sections.creators);

        showCreatorDonations = sections.creatorDonations !== false;

        const stack = document.querySelector(".overlay-stack");
        if (stack) stack.classList.remove("hidden");


      }

      function zeroCreatorsFromSettings(settings) {
        const creators = Array.isArray(settings?.creators) ? settings.creators : [];
        return creators.map(name => ({
          creator: normalizeName(name),
          total: 0,
          smokeNet: 0,
          eatNet: 0,
          presetNets: []
        })).filter(row => row.creator);
      }

      function aggregateWon(won) {
        const n = num(won);
        return Math.trunc(n / 1000) * 1000;
      }

      function aggregateAccountDonorsFromDonations(donations) {
        const map = new Map();
        (donations || []).forEach(d => {
          const account = aggregateWon(d.accountAmount ?? d.account_amount);
          if (account <= 0) return;
          const donor = normalizeName(d.donor || d.donor_name || "익명");
          if (!map.has(donor)) map.set(donor, { donor, amount: 0, latestAt: d.createdAt || d.created_at || "" });
          const row = map.get(donor);
          row.amount += account;
          if (new Date(d.createdAt || d.created_at || 0) > new Date(row.latestAt || 0)) row.latestAt = d.createdAt || d.created_at || "";
        });
        return Array.from(map.values()).sort((a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0)).slice(0, 10);
      }

      function aggregateCreatorsFromDonations(donations, settings) {
        const allowed = new Set((Array.isArray(settings?.creators) ? settings.creators : [])
          .map(normalizeName)
          .filter(Boolean));

        const map = new Map();
        zeroCreatorsFromSettings(settings).forEach(c => map.set(c.creator, c));
        if (!allowed.size) return Array.from(map.values()).slice(0, 5);

        (donations || []).forEach(d => {
          const creator = normalizeName(d.creator || "");
          if (!creator || !allowed.has(creator)) return;

          const account = aggregateWon(d.accountAmount ?? d.account_amount);
          const toonie = aggregateWon(d.toonieAmount ?? d.toonie_amount);
          const total = account + toonie;

          const row = map.get(creator) || { creator, total: 0, smokeNet: 0, eatNet: 0, presetNets: [] };
          row.total += total;
          const stackPending=(d.checks||[]).some(c=>c.meta&&c.stackPlaybackPending===true);
          if(!stackPending)row.smokeNet += num(d.smoke || 0) - num(d.nosmoke || 0);
          if(!stackPending)row.eatNet += num(d.eat || 0) - num(d.noeat || 0);

          (Array.isArray(d.checks) ? d.checks : []).forEach(ch => {
            if(stackPending)return;
            const key = ch.presetId || ch.presetTitle;
            if (!key) return;
            let n = row.presetNets.find(x => (ch.presetId && x.presetId === ch.presetId) || (ch.presetTitle && x.presetTitle === ch.presetTitle));
            if (!n) {
              n = { presetId: ch.presetId, presetTitle: ch.presetTitle, plusName: "", minusName: "", plus: 0, minus: 0 };
              row.presetNets.push(n);
            }
            if (ch.side === "minus") { n.minus += num(ch.count || 1); n.minusName = ch.name || n.minusName; }
            else { n.plus += num(ch.count || 1); n.plusName = ch.name || n.plusName; }
          });

          map.set(creator, row);
        });

        return Array.from(map.values()).slice(0, 5);
      }

      function normalizeCreatorRows(summary) {
        const settings = summary?.settings || defaultSettings;
        const allowed = new Set((Array.isArray(settings?.creators) ? settings.creators : [])
          .map(normalizeName)
          .filter(Boolean));

        const rows = Array.isArray(summary?.creators)
          ? summary.creators
          : (Array.isArray(summary?.creatorSummary) ? summary.creatorSummary : []);

        const cleaned = rows
          .map(row => ({ ...row, creator: normalizeName(row.creator || row.name || "") }))
          .filter(row => row.creator && (!allowed.size || allowed.has(row.creator)));

        if (cleaned.length) return cleaned.slice(0, 5);

        const aggregated = aggregateCreatorsFromDonations(summary?.donations || [], settings);
        return aggregated.length ? aggregated : zeroCreatorsFromSettings(settings);
      }

      function statusLabelsFromPresetNets(presets, row) {
        const nets = Array.isArray(row.presetNets) ? row.presetNets : [];
        return presets.map(preset => {
          const n = nets.find(x => (x.presetId && x.presetId === preset.id) || (x.presetTitle && x.presetTitle === preset.title));
          if (n) {
            const net = num(n.plus) - num(n.minus);
            if (net > 0) return `<span class="plus">${escapeHtml(n.plusName || preset.plusName || "+")} +${Math.abs(net)}</span>`;
            if (net < 0) return `<span class="red">${escapeHtml(n.minusName || preset.minusName || "-")} -${Math.abs(net)}</span>`;
          }
          if (preset.id === "smoke") {
            const net = num(row.smokeNet ?? row.smoke_net ?? 0);
            if (net > 0) return `<span class="plus">${escapeHtml(preset.plusName || "흡연")} +${Math.abs(net)}</span>`;
            if (net < 0) return `<span class="red">${escapeHtml(preset.minusName || "금연")} -${Math.abs(net)}</span>`;
          }
          if (preset.id === "food") {
            const net = num(row.eatNet ?? row.foodNet ?? row.food_net ?? 0);
            if (net > 0) return `<span class="plus">${escapeHtml(preset.plusName || "먹어")} +${Math.abs(net)}</span>`;
            if (net < 0) return `<span class="red">${escapeHtml(preset.minusName || "먹지마")} -${Math.abs(net)}</span>`;
          }
          return `<span class="muted">${escapeHtml(preset.title || "처리")} 0</span>`;
        });
      }

      function accountHeartClass(amount) {
        const v = num(amount);
        if (v <= 10000) return "heart-lv1";
        if (v <= 50000) return "heart-lv2";
        if (v <= 100000) return "heart-lv3";
        return "heart-lv4";
      }


   function renderAllowance(settings) {
 const el=document.getElementById('allowanceRow'),box=document.getElementById('allowanceBox');if(!el||!box)return;
 const input={settings,creators:latestOverlayCreators,config:window.overlay3Presentation};
 const html=window.Overlay3Presets.markup(input);box.dataset.soloEmpty=html?'0':'1';el.innerHTML=html;el.classList.toggle('with-allowance',!!el.querySelector('.solo-allowance'));el.classList.toggle('hidden',!html);box.classList.toggle('hidden',!html);
}
window.addEventListener('overlay3:presentation',()=>{if(!latestSettingsForTimer)return;renderAllowance(latestSettingsForTimer);renderCreators(latestOverlayCreators);});

      function renderAccountRoller(items) {
        rollingItems = items && items.length ? items : [{ donor: "-", amount: 0 }];
        if (rollingTimer) { clearInterval(rollingTimer); rollingTimer = null; }

        const makeItemHtml = item => {
          const donor = normalizeName(item.donor || item.name || "익명");
          const rawAmount = item.amount ?? item.accountAmount ?? item.account_amount ?? item.total ?? 0;
          const amount = displayAmount(rawAmount);
          const heartClass = accountHeartClass(rawAmount);
          const amountNum = Number(rawAmount || 0);

let vipClass = "";
if (amountNum >= 1000000) vipClass = " vip-account vip-100";
else if (amountNum >= 500000) vipClass = " vip-account vip-50";
else if (amountNum >= 300000) vipClass = " vip-account vip-30";
else if (amountNum >= 100000) vipClass = " vip-account vip-10";
          const row=window.overlay3MakeRow({name:Array.from(item.donorDisplayResolved?donor:window.overlay3MaskAccountName(donor)).slice(0,4).join(''),amount:Number(rawAmount)});
          const group=document.createElement('span');group.className='account-donor-group';
          while(row.firstChild)group.append(row.firstChild);
          row.append(group);row.classList.add('roller-item');return row.outerHTML;
        };

        const moveToIndex = (index, useTransition = true) => {
          const item = $track.children[index];
          for(const row of $track.children)row.classList.toggle("perf-visible",row===item);
          const y = item ? item.offsetTop : 0;

          if (useTransition) {
            $track.classList.remove("no-transition");
          } else {
            $track.classList.add("no-transition");
          }

          // offsetTop 기준으로 이동해서 프리즘 스케일/폰트 렌더링 차이에도 누적 오차가 생기지 않음
          $track.style.transform = `translate3d(0, ${-y}px, 0)`;
        };

        if (rollingItems.length <= 1) {
          rollingIndex = 0;
          $track.innerHTML = rollingItems.map(makeItemHtml).join("");
          moveToIndex(0, false);
          return;
        }

        const renderItems = [...rollingItems, rollingItems[0]];
        $track.innerHTML = renderItems.map(makeItemHtml).join("");

        rollingIndex = 0;
        moveToIndex(0, false);
        $track.offsetHeight;
        $track.classList.remove("no-transition");

        const holdMs = 2600;
        const transitionMs = 420;

        rollingTimer = setInterval(() => {
          rollingIndex += 1;
          moveToIndex(rollingIndex, true);

          if (rollingIndex === rollingItems.length) {
            setTimeout(() => {
              rollingIndex = 0;
              moveToIndex(0, false);
              $track.offsetHeight;
              $track.classList.remove("no-transition");
            }, transitionMs + 30);
          }
        }, holdMs);
      }

      function renderCreators(creators) {
        const creatorOrder = new Map(
  (Array.isArray(latestSettingsForTimer?.creators) ? latestSettingsForTimer.creators : [])
    .map((name, idx) => [normalizeName(name), idx])
);

const totalOf=r=>num(r.total??r.totalAmount??r.total_amount??r.amount??0);
const others=new Set((window.overlay3Targets||[]).filter(t=>t.group==='other').map(t=>normalizeName(t.name)));
const allRows=Array.isArray(creators)?creators:[];
const otherRows=allRows.filter(r=>others.has(normalizeName(r.creator||r.name||'')));
const rows=allRows.filter(r=>!others.has(normalizeName(r.creator||r.name||''))).slice().sort((a,b)=>totalOf(b)-totalOf(a)||(creatorOrder.get(normalizeName(a.creator||a.name))??9999)-(creatorOrder.get(normalizeName(b.creator||b.name))??9999));
        const presentation=window.overlay3Presentation;
        const showPresets=(!presentation||presentation.selectedSections?.includes('presets'))&&!window.Overlay3Presets.isSolo(presentation,creators);
        const visiblePresets = showPresets?(enabledPresets || []).filter(p => p.enabled !== false):[];
        const showDonation = (!presentation||presentation.selectedSections?.includes('creators'))&&showCreatorDonations;

        if (!rows.length && !otherRows.length) {
          $list.innerHTML = "";
          return;
        }

        function presetShortName(preset) {return window.Overlay3Presets.icon(preset);}

        function presetNetValue(row, preset) {
          const nets = Array.isArray(row.presetNets) ? row.presetNets : [];
          const n = nets.find(x =>
            (preset.id && x.presetId === preset.id) ||
            (preset.title && x.presetTitle === preset.title)
          );

          if (n) return num(n.plus) - num(n.minus);

          if (preset.id === "smoke") {
            return num(row.smokeNet ?? row.smoke_net ?? 0);
          }

          if (preset.id === "food") {
            return num(row.eatNet ?? row.foodNet ?? row.food_net ?? 0);
          }

          return 0;
        }

        function signedText(prefix, value) {
          const n = Number(value || 0);
          return prefix + (n < 0 ? "-" + Math.abs(n) : "+" + n);
        }

        function signClass(value) {
          const n = Number(value || 0);
          if (n < 0) return "red";
          return "plus";
        }

        $list.innerHTML = rows.map((row,rank) => {
          const rawName = normalizeName(row.creator || row.name || "익명");
          const shortName = Array.from(rawName).slice(0, 4).join("") || "익명";
          const total = displayManAmount(row.total ?? row.totalAmount ?? row.total_amount ?? row.amount ?? 0);

          const totalHtml=showDonation?'<strong class="o3-rank-money">'+escapeHtml(displayManAmount(totalOf(row)))+'</strong>':'';
          const optionHtml = visiblePresets.map(preset => {
            const value = presetNetValue(row, preset);
            const label = signedText(presetShortName(preset), value);
            return `<span class="creator-align-opt ${signClass(value)}" aria-label="${escapeHtml(label)}">${window.Overlay3Presets.iconMarkup(preset)}<span>${value>0?'+':''}${escapeHtml(String(value))}</span></span>`;
          }).join("");

          return '<article><div class="o3-rank"><em>'+(rank+1)+'</em><div class="o3-creator-inline">'+window.overlay3CreatorName(rawName)+(optionHtml?'<span class="o3-options">'+optionHtml+'</span>':'')+'</div>'+totalHtml+'</div></article>';
        }).join("")+(otherRows.length?'<div class="o3-other">'+otherRows.map(r=>escapeHtml(normalizeName(r.creator||r.name))+'('+escapeHtml(displayAmount(totalOf(r)))+')').join(' · ')+'</div>':'');
      }

      async function fetchJson(url, options = {}) {
        let finalUrl = url;
        const sep1 = finalUrl.includes("?") ? "&" : "?";
        finalUrl = finalUrl + sep1 + "station=" + encodeURIComponent(STATION_SLUG);
        if (ACCESS_TOKEN) {
          const sep = finalUrl.includes("?") ? "&" : "?";
          finalUrl = finalUrl + sep + "token=" + encodeURIComponent(ACCESS_TOKEN);
        }
        const sepNoCache = finalUrl.includes("?") ? "&" : "?";
        finalUrl = finalUrl + sepNoCache + "_=" + Date.now();
        const fetchOptions = Object.assign({ cache: "no-store" }, options || {});
        if (fetchOptions.method && fetchOptions.method !== "GET") {
          fetchOptions.headers = Object.assign({ "Content-Type": "application/json" }, fetchOptions.headers || {});
        }
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const res=await fetch(finalUrl,{...fetchOptions,signal:controller.signal});if(!res.ok)throw Error(url+' '+res.status);return await res.json();}finally{clearTimeout(timeout);}
      }

      async function loadData() {
        const params = new URLSearchParams(location.search);
        if (params.get("demo") === "1") return demoData;

        const toOverlayData = (s) => {
          const settings = s.settings && Object.keys(s.settings).length ? s.settings : defaultSettings;
          const accountDonors = (s.accountDonors && s.accountDonors.length)
            ? s.accountDonors
            : aggregateAccountDonorsFromDonations(s.donations || []);
          return {
            settings,broadcastId:s.broadcastId,live:s.live,presentation:s.presentation,
            accountDonors,
            creators: normalizeCreatorRows({ ...s, settings }),
            donations: s.donations || []
          };
        };

        const state=await fetchJson(API_SUMMARY);if(!state.presentation)state.presentation=await fetchJson('/api/alert-config');return toOverlayData(state);
      }

function updateBroadcastTimer() {
  if (!$broadcastTimerValue) return;

  const diff = latestSettingsForTimer ? timerBaseMs(latestSettingsForTimer) : 0;
  const timerData = latestSettingsForTimer?.broadcastTimerData || {};

  const labelEl = document.querySelector(".timer-label");
  if (labelEl) {
    const text = Object.prototype.hasOwnProperty.call(timerData, "label") ? String(timerData.label ?? "") : "미션타이머";
    if(labelEl.textContent!==text)labelEl.textContent=text;
  }

  const sec = Math.max(0, timerData.mode === "countup" ? Math.floor(diff / 1000) : Math.ceil(diff / 1000));

  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");

  const text = `${h}:${m}:${s}`;
  if($broadcastTimerValue.textContent!==text)$broadcastTimerValue.textContent=text;

}
const timerTick=setInterval(updateBroadcastTimer,250);

      let disposed=false,loading=null,resyncQueued=false,resyncTimer=null,hasConnected=false;
      function renderLive(data,changes){
        if(disposed)return;const settings=data.settings||defaultSettings;const has=(...keys)=>!changes||keys.some(k=>changes.has(k));
        latestSettingsForTimer=settings;latestOverlayCreators=data.creators?.length?data.creators:zeroCreatorsFromSettings(settings);
        if(has('stationStyle'))window.OverlayAppearance?.apply(settings.stationStyle?.compactPreview);
        if(has('presentation')||!changes){if(data.presentation)window.OverlayPresentation?.applyConfig(data.presentation);}
        if(has('broadcastLiveData')){const live=settings.broadcastLiveData||{};document.body.classList.toggle('broadcast-not-live',!(live.live===true||live.status==='live'));const idle=document.getElementById('overlayIdleScreen');if(idle)idle.textContent=live.status==='ended'?'방송 종료':'시스템설정';}
        if(has('presets'))enabledPresets=getEnabledPresets(settings);
        if(has('title')){const title=document.querySelector('#creatorBox .creator-title');if(title)o3Heading(title,settings.title||'방송인 후원 순위');}
        if(has('overlaySections','presentation'))applySections(settings);
        if(has('notice','noticeTitle','noticeColors','noticeAligns','overlaySections'))renderNotice(settings);
        if(has('fundingData','overlaySections'))renderFunding(settings);
        if(has('karaokeData','overlaySections'))renderKaraoke(settings);
        if(has('stationStyle','titleImage','overlaySections'))renderTopSlide(settings);
        if(has('allowanceData','presets','creators','presentation','overlaySections'))renderAllowance(settings);
        if(has('accountDonors'))renderAccountRoller(data.accountDonors||[]);
        if(has('creators','presets','presentation','overlaySections'))renderCreators(latestOverlayCreators);
        if(has('broadcastTimerData')){studioMissionClock.apply({broadcastId:data.broadcastId,broadcastTimerData:settings.broadcastTimerData,serverNow:Date.now()});updateBroadcastTimer();}
        syncO3Headings();
      }
      const store=createOverlayLiveStore({onChange:renderLive,onGap:()=>scheduleResync()});
      function scheduleResync(){if(disposed||resyncTimer)return;resyncTimer=setTimeout(()=>{resyncTimer=null;refresh();},25);}
      async function refresh(){if(disposed)return;if(loading){resyncQueued=true;return loading;}store.begin();loading=(async()=>{try{const data=await loadData();if(!disposed)store.snapshot(data);}catch(e){store.abort();debugLog('동기화 실패',e.message);}})();try{await loading;}finally{loading=null;if(resyncQueued&&!disposed){resyncQueued=false;scheduleResync();}}}
      const changed=e=>{const {topic,payload}=e.detail||{};if(topic==='overlayPatch'){store.patch(payload);return;}if(['state','rules'].includes(topic))scheduleResync();};
      const connected=()=>{window.__overlaySocketConnected=true;if(hasConnected)refresh();hasConnected=true;};
      const disconnected=()=>{window.__overlaySocketConnected=false;};
      window.addEventListener('collection:changed',changed);window.addEventListener('collection:connected',connected);window.addEventListener('collection:disconnected',disconnected);
      const fallback=setInterval(()=>{if(!window.__overlaySocketConnected)refresh();},30000);
      const targets=()=>scheduleResync();window.addEventListener('overlay3:targets',targets);
      window.addEventListener('pagehide',()=>{disposed=true;clearInterval(fallback);clearInterval(timerTick);clearTimeout(resyncTimer);clearInterval(rollingTimer);clearInterval(o3FundingTimer);clearInterval(topSlideTimer);stopNoticeSteps();store.close();window.removeEventListener('collection:changed',changed);window.removeEventListener('collection:connected',connected);window.removeEventListener('collection:disconnected',disconnected);window.removeEventListener('overlay3:targets',targets);},{once:true});
      refresh();
    })();
