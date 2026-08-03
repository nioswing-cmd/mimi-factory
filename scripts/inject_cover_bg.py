# -*- coding: utf-8 -*-
"""미미팩토리 — 앱 첫 화면 배경에 표지(cover)를 "보이게" 까는 주입 스크립트.

* apps.json 의 teaser/premium -> cover 매핑을 사용한다 (파일명 추론 X, 예외가 있음).
* 각 HTML 의 </head> 바로 앞에 <style>+<script> 한 조각만 주입한다.
* 이미 주입돼 있으면 건너뛴다(재실행 안전). --force 로 재주입(기존 블록 교체) 가능.
* 레이아웃/기능은 건드리지 않는다. body 의 첫 자식으로 fixed·z-index:-1 레이어만 추가한다.

--- 2차 개정(가시성 강화) ---
1) 톤 매핑: 기존의 "밝기 하드캡(darken rgb(40))" 은 밝은 표지를 통짜 회색으로 뭉개서
   그림이 사라졌다. 표지별 p5/p95 휘도를 재서 목표 밴드 [L0,L1] 로 옮기는 아핀 변환
   (brightness→contrast→brightness) 으로 바꾼다. 디테일이 살아남는다.
   darken 캡은 "극단 하이라이트 방지" 안전장치로만 높은 값에서 남긴다.
2) 칼럼 스크림: 글자가 있는 본문 칼럼 안쪽만 진하게 덮고, 카드 바깥(넓은 화면의 좌우
   여백)은 거의 덮지 않는다. 대비 제약은 글자가 있는 곳에만 있으므로 손해가 없다.
3) 카드 글래스: 첫 화면의 불투명한 패널 배경 알파를 낮추고 backdrop-filter 를 걸어
   표지가 카드를 통해 비쳐 보이게 한다 (computed style 의 rgb/rgba 알파를 스케일).

사용:
  python -X utf8 inject_cover_bg.py                 # 전체
  python -X utf8 inject_cover_bg.py --only a.html b.html
  python -X utf8 inject_cover_bg.py --revert        # 주입 블록 제거
"""
import os, re, sys, json, io, shutil, datetime
from urllib.parse import quote

# 리포 안 어디서 실행하든 리포 루트를 스스로 찾는다 (PC 절대경로 하드코딩 제거)
ROOT = os.environ.get("MMF_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

START = "<!-- mmf-cover-bg:start -->"
END = "<!-- mmf-cover-bg:end -->"
BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\s*", re.S)

TPL = """{start}
<style id="mmf-cover-css">
/* 표지를 첫 화면 배경으로 깐다. 밝기는 표지별 아핀 톤매핑으로 안전 밴드에 넣고,
   글자 보호 스크림은 "본문 칼럼 안쪽"에만 강하게 건다.
   - ::before        : 표지 (blur + 톤매핑 + 채도)
   - ::after         : rgb(cap) + mix-blend-mode:darken -> 극단 하이라이트만 컷
   - .mmf-scrim      : 전역 약한 스크림 (카드 바깥 포함)
   - .mmf-scrim2     : 본문 칼럼에만 걸리는 글자보호 스크림 (좌우 마스크)
   - 마스크 2종      : 표지는 m0~m2 에서 사라지고, 스크림은 그보다 늦게(n0~n2) 사라진다.
     (같이 사라지면 페이지 하단 — 카드 밖 푸터 글자 — 에서 표지만 남아 대비가 깨진다) */
#mmf-cover-bg{{
  position:fixed; inset:0; z-index:-1; pointer-events:none;
  opacity:0; transition:opacity .5s ease; isolation:isolate;
  --mmf-cover:url("{url}");
  --mmf-l0:0%; --mmf-l:0%; --mmf-r:100%; --mmf-r0:100%;
  --mmf-mimg:linear-gradient(180deg,#000 0%,#000 {m0}%,rgba(0,0,0,.55) {m1}%,transparent {m2}%);
  --mmf-mscr:linear-gradient(180deg,#000 0%,#000 {n0}%,rgba(0,0,0,.6) {n1}%,transparent {n2}%);
}}
#mmf-cover-bg::before,#mmf-cover-bg::after{{
  content:"";position:absolute;
  -webkit-mask-image:var(--mmf-mimg); mask-image:var(--mmf-mimg);
}}
#mmf-cover-bg::before{{
  z-index:0; inset:-6%;
  background-image:var(--mmf-cover);
  background-size:cover; background-position:center 20%; background-repeat:no-repeat;
  filter:blur({blur}) brightness({b0}) contrast({ct}) brightness({b1}) saturate({sat});
}}
#mmf-cover-bg::after{{
  z-index:1; inset:0;
  background:rgb({cap},{cap},{cap});
  mix-blend-mode:darken;
}}
#mmf-cover-bg>.mmf-scrim{{
  z-index:2; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,{g0}) 0%,rgba(0,0,0,{g1}) 55%,rgba(0,0,0,{g2}) 100%);
  -webkit-mask-image:var(--mmf-mscr); mask-image:var(--mmf-mscr);
}}
/* 세로 페이드(마스크)와 가로 칼럼(마스크)을 한 요소에 겹치면 mask-composite 가 필요해
   구형 브라우저에서 조용히 반대로 동작한다. 겹치지 않게 2겹으로 중첩한다. */
#mmf-cover-bg>.mmf-scrim2w{{
  z-index:3; position:absolute; inset:0;
  -webkit-mask-image:var(--mmf-mscr); mask-image:var(--mmf-mscr);
}}
#mmf-cover-bg .mmf-scrim2{{
  position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,{s0}) 0%,rgba(0,0,0,{s1}) 55%,rgba(0,0,0,{s2}) 100%);
  -webkit-mask-image:linear-gradient(90deg,transparent var(--mmf-l0),#000 var(--mmf-l),#000 var(--mmf-r),transparent var(--mmf-r0));
          mask-image:linear-gradient(90deg,transparent var(--mmf-l0),#000 var(--mmf-l),#000 var(--mmf-r),transparent var(--mmf-r0));
}}
html.mmf-cover-on #mmf-cover-bg{{opacity:{img_op};}}
@media (prefers-reduced-motion:reduce){{#mmf-cover-bg{{transition:none;}}}}
@media print{{#mmf-cover-bg{{display:none!important;}}}}
</style>
<script id="mmf-cover-js">
(function(){{
  "use strict";
  var GLASS={glass}, GK={gk}, GKIN={gkin}, GBLUR="{gblur}", GSHADOW={gshadow}, GMIN={gmin};
  function boot(){{
    try{{
      var d=document, root=d.documentElement, body=d.body;
      if(!body || d.getElementById('mmf-cover-bg')) return;
      var layer=d.createElement('div');
      layer.id='mmf-cover-bg';
      layer.setAttribute('aria-hidden','true');
      var scrim=d.createElement('div'); scrim.className='mmf-scrim';
      var wrap2=d.createElement('div'); wrap2.className='mmf-scrim2w';
      var scrim2=d.createElement('div'); scrim2.className='mmf-scrim2';
      wrap2.appendChild(scrim2);
      layer.appendChild(scrim); layer.appendChild(wrap2);
      body.insertBefore(layer, body.firstChild);

      /* opacity 는 등장 애니메이션(opacity:0 에서 시작) 때문에 판정에 쓰지 않는다 */
      function rendered(el){{
        if(!el) return false;
        var cs=getComputedStyle(el);
        if(cs.display==='none'||cs.visibility==='hidden') return false;
        var r=el.getBoundingClientRect();
        return r.width>8 && r.height>8;
      }}
      function onScreen(el){{
        if(!rendered(el)) return false;
        var r=el.getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
      }}
      /* 첫 화면 후보: 로드 시점에 실제로 그려져 있는 첫 번째 것 */
      var home=null;
      var sels=['#home','#startScreen','#screen-home','#intro','#start','#cover',
                'section.screen.on','.screen.on','section.home','.home',
                'section#home','main>section','.wrap>section','.app>section','body>section','section'];
      for(var i=0;i<sels.length && !home;i++){{
        var list=d.querySelectorAll(sels[i]);
        for(var j=0;j<list.length;j++){{ if(rendered(list[j])){{ home=list[j]; break; }} }}
      }}
      if(!home){{
        var h=d.querySelector('.hero,.card,h1');
        home=h?(h.closest('section')||h.parentElement):body.firstElementChild;
      }}
      if(!home) return;

      /* ---------- 1) 본문 칼럼 폭 측정 -> 칼럼 스크림 마스크 ---------- */
      var lastCol='';
      function colBox(){{
        var vw=innerWidth||1, r=home.getBoundingClientRect();
        var l=r.left, rt=r.right;
        var kids=home.querySelectorAll('*');
        for(var i=0;i<kids.length;i++){{
          var q=kids[i].getBoundingClientRect();
          if(q.width>60 && q.height>40){{ if(q.left<l) l=q.left; if(q.right>rt) rt=q.right; }}
        }}
        if(!(rt>l)){{ l=0; rt=vw; }}
        var pad=18, fade=Math.max(60, vw*0.07);
        var L=Math.max(0,l-pad), R=Math.min(vw,rt+pad);
        var pc=function(x){{ return (Math.max(-20,Math.min(120,x/vw*100))).toFixed(2)+'%'; }};
        var v=[pc(L-fade),pc(L),pc(R),pc(R+fade)].join('|');
        /* MutationObserver 가 style 변경을 감시하므로, 값이 같을 때도 쓰면
           setProperty -> mutation -> ping -> colBox 무한 rAF 루프가 된다 */
        if(v===lastCol) return;
        lastCol=v;
        var st=layer.style, n=v.split('|');
        st.setProperty('--mmf-l0', n[0]);
        st.setProperty('--mmf-l',  n[1]);
        st.setProperty('--mmf-r',  n[2]);
        st.setProperty('--mmf-r0', n[3]);
      }}

      /* ---------- 2) 첫 화면 카드 반투명화(글래스) ---------- */
      function scaleAlphas(str,k){{
        if(!str || str==='none') return str;
        return str.replace(/\\brgba?\\(\\s*([^()]*)\\)/gi, function(m, inner){{
          var nums, a=1;
          if(inner.indexOf('/')>=0){{
            var sp=inner.split('/');
            nums=sp[0].trim().split(/[\\s,]+/).filter(Boolean).map(parseFloat);
            var at=sp[1].trim();
            a = at.charAt(at.length-1)==='%' ? parseFloat(at)/100 : parseFloat(at);
          }} else {{
            nums=inner.trim().split(/[\\s,]+/).filter(Boolean).map(parseFloat);
            if(nums.length>3) a=nums[3];
          }}
          if(nums.length<3) return m;
          for(var i=0;i<3;i++) if(isNaN(nums[i])) return m;
          if(isNaN(a)) a=1;
          var na=Math.max(0,Math.min(1,a*k));
          return 'rgba('+nums[0]+','+nums[1]+','+nums[2]+','+(Math.round(na*1000)/1000)+')';
        }});
      }}
      function maxAlpha(str){{
        var mx=0, re=/rgba?\\(\\s*([^()]*)\\)/gi, mm;
        while((mm=re.exec(str))){{
          var q=mm[1].replace('/',' ').trim().split(/[\\s,]+/).filter(Boolean).map(parseFloat);
          var av = q.length>3 ? q[3] : 1;
          if(!isNaN(av) && av>mx) mx=av;
        }}
        return mx;
      }}
      function glassify(){{
        if(!GLASS) return;
        var hw=home.getBoundingClientRect().width||1;
        var els=home.querySelectorAll('*'), done=[];
        for(var i=0;i<els.length;i++){{
          var el=els[i], tag=el.tagName;
          if(tag==='BUTTON'||tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||tag==='IMG'||tag==='SVG') continue;
          if(el.dataset.mmfGlass) continue;
          var r=el.getBoundingClientRect();
          if(r.width < Math.max(200, hw*0.5) || r.height < 70) continue;
          var cs=getComputedStyle(el);
          if((cs.webkitBackgroundClip||cs.backgroundClip)==='text') continue;
          var bc=cs.backgroundColor||'', bi=cs.backgroundImage||'none';
          var alpha = bc && bc!=='transparent' ? maxAlpha(bc) : 0;
          var hasGrad = bi!=='none' && /gradient/i.test(bi);
          /* 이미 반투명한 카드(예: rgba(255,255,255,.06) 글래스)는 건드리지 않는다.
             더 투명하게 만들면 글자 대비만 깎이고 얻을 게 없다. */
          var eff = 1-(1-alpha)*(1-(hasGrad?maxAlpha(bi):0));
          if(eff < GMIN) continue;
          /* 이미 위쪽 조상이 글래스면 더 약하게 (겹치면 불투명도가 곱해진다) */
          var nested=false;
          for(var t=0;t<done.length;t++) if(done[t].contains(el)){{ nested=true; break; }}
          var k = nested ? GKIN : GK;
          if(alpha>0.001) el.style.setProperty('background-color', scaleAlphas(bc,k), 'important');
          if(hasGrad) el.style.setProperty('background-image', scaleAlphas(bi,k), 'important');
          if(GBLUR){{
            el.style.setProperty('-webkit-backdrop-filter', GBLUR, 'important');
            el.style.setProperty('backdrop-filter', GBLUR, 'important');
          }}
          if(GSHADOW<1 && cs.boxShadow && cs.boxShadow!=='none')
            el.style.setProperty('box-shadow', scaleAlphas(cs.boxShadow,GSHADOW), 'important');
          el.dataset.mmfGlass='1';
          done.push(el);
        }}
      }}

      var raf=0, last=null;
      function apply(){{
        raf=0;
        colBox();
        var on=onScreen(home);
        if(on===last) return;
        last=on;
        root.classList.toggle('mmf-cover-on', on);
      }}
      function ping(){{ if(!raf) raf=requestAnimationFrame(apply); }}
      /* 글래스 처리가 실패해도 배경 레이어 자체는 살아 있어야 한다 */
      function safeGlass(){{ try{{ glassify(); }}catch(e){{}} }}
      apply();
      safeGlass();
      addEventListener('load', function(){{ safeGlass(); ping(); }});
      addEventListener('scroll', ping, {{passive:true}});
      addEventListener('resize', ping, {{passive:true}});
      addEventListener('click', function(){{ setTimeout(ping,0); setTimeout(ping,320); }}, true);
      [80,400,1200].forEach(function(t){{ setTimeout(function(){{ safeGlass(); ping(); }},t); }});
      try{{
        new MutationObserver(ping).observe(body,{{
          subtree:true, childList:true, attributes:true,
          attributeFilter:['class','style','hidden']
        }});
      }}catch(e){{}}
    }}catch(e){{}}
  }}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
}})();
</script>
{end}
"""


def load_map():
    with open(os.path.join(ROOT, "apps.json"), encoding="utf-8") as f:
        data = json.load(f)
    m = {}
    for a in data["apps"]:
        cov = a.get("cover")
        if not cov:
            continue
        for k in ("teaser", "premium"):
            if a.get(k):
                m.setdefault(a[k].replace("\\", "/"), cov.replace("\\", "/"))
    return m


def _f(name, default):
    return float(os.environ.get(name, default))


# 튜닝 노브 (환경변수로 덮어쓰기 가능 — 대비/가시성 실측 루프에서 사용)
KNOBS = dict(
    # 넓은 화면에서는 표지가 4배까지 확대돼서 고정 px 블러로는 '큰 그림'처럼 보인다.
    # 화면 폭에 비례시키면 어느 폭에서도 '은은한 배경'으로 읽힌다.
    blur=os.environ.get("MMF_BLUR", "calc(6px + 1.1vw)"),
    # 레이어 자체의 불투명도. 이걸 낮추면 앱 원래 배경과 섞인다 —
    # 스크림(검정)으로 누르는 것과 달리 앱 고유 색을 지키면서 표지 구조만 얹을 수 있고,
    # op->0 이면 대비가 원본으로 수렴하므로 가장 안전한 조절 손잡이다.
    img_op=os.environ.get("MMF_IMGOP", "0.8"),
    # 전역(카드 바깥 포함) 약한 스크림
    g0=os.environ.get("MMF_G0", ".00"),
    g1=os.environ.get("MMF_G1", ".06"),
    g2=os.environ.get("MMF_G2", ".18"),
    # 표지가 아래로 사라지는 마스크 (%)
    m0=os.environ.get("MMF_M0", "38"),
    m1=os.environ.get("MMF_M1", "68"),
    m2=os.environ.get("MMF_M2", "88"),
    # 스크림이 사라지는 마스크 (%) — 표지보다 늦게 사라져야 하단 글자를 보호한다
    n0=os.environ.get("MMF_N0", "52"),
    n1=os.environ.get("MMF_N1", "82"),
    n2=os.environ.get("MMF_N2", "100"),
    # 카드 글래스
    glass=os.environ.get("MMF_GLASS", "1"),
    gk=os.environ.get("MMF_GK", "0.55"),
    gkin=os.environ.get("MMF_GKIN", "0.8"),
    gmin=os.environ.get("MMF_GMIN", "0.30"),
    gblur=os.environ.get("MMF_GBLUR", "blur(5px) saturate(1.15)"),
    gshadow=os.environ.get("MMF_GSHADOW", "0.6"),
)

# 칼럼 스크림은 스칼라 하나(sk)로 조절한다. 앱마다 글자 대비 여유가 완전히 달라서
# (삼체는 남아돌고 mbti 는 원래부터 4.2:1 아슬아슬) 파일별로 자동 보정한다.
# 위(0%)를 크게 열어둔 모양 = '히어로 밴드'. 첫 화면 상단은 대개 큰 글씨(기준 3.0:1)라
# 여유가 있고, 대비를 잡아먹는 11~13px 잔글씨는 중간~아래에 몰려 있다.
SK_SHAPE = (0.40, 0.92, 1.00)


def scrim_from_sk(sk):
    return {f"s{i}": f"{max(0.0, min(0.95, sk * SK_SHAPE[i])):.3f}" for i in range(3)}


def load_tune():
    """파일별 보정값 (tune.py 가 실측으로 만든다). {rel: {"sk":..,"l1":..,"gk":..}}"""
    # 보정값은 리포에 함께 둔다 (.tmp/ 는 gitignore 라 서버에 없다)
    p = os.environ.get("MMF_TUNE") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "cover-bg-tune.json")
    if os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print("tune.json 읽기 실패:", e)
    return {}


TUNE = load_tune()


_TONE_CACHE = {}


def cover_tone(cover_rel, l1=None, sm=None):
    """표지 84장의 밝기·대비가 제각각(평균 0.02~0.95, 표준편차 0.03~0.20)이라
    그대로 깔면 어두운 표지는 안 보이고 밝은 표지는 화면을 날린다.
    표지의 p5~p95 휘도를 목표 밴드 [L0,L1] 로 옮기는 아핀 변환을 CSS filter
    (brightness b0 -> contrast ct -> brightness b1) 로 구현한다.
      out = in*(b0*ct*b1) + 0.5*b1*(1-ct)      => gain G, offset O
    """
    ck = (cover_rel, l1, sm)
    if ck in _TONE_CACHE:
        return _TONE_CACHE[ck]
    from PIL import Image

    L0 = _f("MMF_L0", "0.05")
    L1 = float(l1) if l1 is not None else _f("MMF_L1", "0.42")
    CHROMA = _f("MMF_CHROMA", "0.15")

    im = Image.open(os.path.join(ROOT, cover_rel.replace("/", os.sep)))
    im = im.convert("RGB").resize((80, 120))
    px = list(im.getdata())
    n = len(px)
    lums = sorted((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 for r, g, b in px)
    p5, p95 = lums[int(n * 0.05)], lums[int(n * 0.95)]
    mean = sum(lums) / n
    chroma = sum(max(p) - min(p) for p in px) / n / 255

    span = max(p95 - p5, 0.03)
    G = (L1 - L0) / span
    G = max(0.35, min(3.2, G))
    O = L0 - G * p5

    b1 = 0.6
    ct = 1.0 - 2.0 * O / b1
    ct = max(0.05, min(14.0, ct))
    b0 = G / (ct * b1)
    b0 = max(0.03, min(14.0, b0))

    # 명도 대비(WCAG)는 휘도만 본다. 채도는 '공짜로 보이게' 만드는 지렛대라서
    # 대비 여유가 없는 앱일수록 채도를 올려 표지를 알아보게 한다.
    sat = CHROMA / max(chroma * G, 0.02)
    sat = max(0.7, min(2.6, sat)) * float(sm if sm is not None else _f("MMF_SM", "1.0"))
    sat = max(0.5, min(6.0, sat))

    cap = int(round(255 * min(0.85, L1 + 0.13)))
    cap = max(60, min(215, cap))

    val = dict(
        b0=round(b0, 3), ct=round(ct, 3), b1=round(b1, 3),
        sat=round(sat, 2), cap=cap,
    )
    _TONE_CACHE[ck] = (val, dict(mean=round(mean, 3), p5=round(p5, 3),
                                 p95=round(p95, 3), chroma=round(chroma, 3),
                                 G=round(G, 3), O=round(O, 3)))
    return _TONE_CACHE[ck]


def cover_url(cover_rel):
    # apps/xxx.html 기준 상대경로 -> ../covers/name.webp  (퍼센트 인코딩)
    parts = cover_rel.split("/")
    return "../" + "/".join(quote(p) for p in parts)


def process(path, cover_rel, revert=False, force=False):
    full = os.path.join(ROOT, path.replace("/", os.sep))
    with io.open(full, encoding="utf-8", newline="") as f:
        s = f.read()
    had = START in s
    if revert:
        if not had:
            return "skip(none)"
        s2 = BLOCK_RE.sub("", s)
    else:
        if had and not force:
            return "skip(already)"
        if had:
            s = BLOCK_RE.sub("", s)
        tv = TUNE.get(path, {})
        knobs = dict(KNOBS)
        knobs.update(scrim_from_sk(float(tv.get("sk", os.environ.get("MMF_SK", 0.46)))))
        if "gk" in tv:
            knobs["gk"] = str(tv["gk"])
        if "op" in tv:
            knobs["img_op"] = str(tv["op"])
        knobs.update(cover_tone(cover_rel, tv.get("l1"), tv.get("sm"))[0])
        block = TPL.format(start=START, end=END, url=cover_url(cover_rel), **knobs)
        i = s.lower().find("</head>")
        if i < 0:
            return "FAIL(no </head>)"
        s2 = s[:i] + block + s[i:]
    if s2 == s:
        return "nochange"
    tmp = full + ".mmftmp"
    with io.open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(s2)
    os.replace(tmp, full)
    return "reverted" if revert else ("reinjected" if had else "injected")


def main():
    args = sys.argv[1:]
    revert = "--revert" in args
    force = "--force" in args
    verbose = "-v" in args
    only = None
    if "--only" in args:
        only = [a for a in args[args.index("--only") + 1:] if not a.startswith("--")]
    m = load_map()
    targets = sorted(m) if not only else [o.replace("\\", "/") for o in only]
    stats = {}
    for t in targets:
        cov = m.get(t)
        if not cov:
            print("NO COVER:", t)
            stats["nocover"] = stats.get("nocover", 0) + 1
            continue
        if verbose and not revert:
            tv = TUNE.get(t, {})
            v, st = cover_tone(cov, tv.get("l1"), tv.get("sm"))
            print(f"  {t}\n     cover={cov} {st}\n     filter={v}  tune={tv or '(기본값)'}")
        r = process(t, cov, revert, force)
        stats[r] = stats.get(r, 0) + 1
        if r.startswith("FAIL"):
            print(r, t)
    print("files:", len(targets), "|", stats)


if __name__ == "__main__":
    main()
