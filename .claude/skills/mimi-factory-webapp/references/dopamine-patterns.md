# 도파민 패턴 레퍼런스

미미팩토리 웹앱을 빌드할 때 복사해서 쓰는 토큰·코드 모음. SKILL.md에서 이 파일을 가리킨다.

## 목차
1. 컬러 팔레트 & CSS 변수
2. 타이포 & 폰트 로드
3. 핵심 모션 (팝 / 페이드 / 게이지 글로우)
4. 도파민 스니펫 (진동 / 셔플 / 토스트 / 색 변주)
5. 점층 색 테마 (따뜻→뜨겁게)
6. 완주 보상 화면
7. 마무리 자가 점검 체크리스트

---

## 1. 컬러 팔레트 & CSS 변수

다크 무드 기본값. 따뜻한 포인트가 도파민 톤.

```css
:root{
  --bg1:#1a1230; --bg2:#2d1b4e;          /* 배경 그라디언트 */
  --accent1:#ffd56b; --accent2:#ffb347;  /* 포인트(변동 가능) */
  --cream:#fff6ec; --muted:#cdbfe0;      /* 텍스트 */
  --card:#241a3d;                        /* 카드 면 */
}
body{
  color:var(--cream);
  background:
    radial-gradient(120% 80% at 80% -10%, rgba(255,180,90,.10), transparent 55%),
    radial-gradient(120% 90% at 10% 110%, rgba(255,94,138,.12), transparent 55%),
    linear-gradient(160deg,var(--bg1),var(--bg2));
  background-attachment:fixed;
  transition:background .9s ease;   /* 테마 전환 시 부드럽게 */
}
```

다른 무드가 필요하면 배경 hue만 바꾸고 구조는 유지한다(딥 블루, 딥 그린, 딥 와인 등).

## 2. 타이포 & 폰트 로드

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
```

- 디스플레이/제목: `'Jua'` (둥글고 친근). 임팩트가 더 필요하면 `Black Han Sans`, 손글씨 감성은 `Gaegu`.
- 본문: `'Noto Sans KR'`.
- 강조 텍스트 그라디언트:
```css
.grad{
  background:linear-gradient(105deg,#ffd56b,#ff8a5b 45%,#ff5e8a);
  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
}
```
- 한글 줄바꿈 깨짐 방지: 긴 문장 박스에 `word-break:keep-all;`

## 3. 핵심 모션

```css
/* 팝: 카드/버튼이 등장하거나 갱신될 때 */
.pop{animation:pop .42s cubic-bezier(.34,1.56,.64,1);}
@keyframes pop{
  0%{transform:scale(.9) rotate(-1.5deg); opacity:.4;}
  60%{transform:scale(1.02) rotate(.5deg);}
  100%{transform:scale(1) rotate(0); opacity:1;}
}
/* 화면 진입 */
@keyframes fadeIn{from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:none;}}

/* 진행 게이지: 차오를 때 글로우 */
.gauge{height:9px; border-radius:99px; background:rgba(255,255,255,.1); overflow:hidden;}
.gaugefill{
  height:100%; width:0%; border-radius:99px;
  background:linear-gradient(90deg,var(--accent1),var(--accent2));
  box-shadow:0 0 14px 1px var(--accent2);
  transition:width .5s cubic-bezier(.22,1,.36,1), box-shadow .6s;
}

/* 접근성: 모션 최소화 존중 (항상 포함) */
@media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important;} }
```

팝 재실행 트릭(같은 요소 재트리거):
```js
el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
```

## 4. 도파민 스니펫

```js
// 촉각 피드백
function vibrate(ms){ if(navigator.vibrate) try{ navigator.vibrate(ms); }catch(e){} }
// 사용: 뽑기 vibrate(28); 축하 vibrate([20,40,20]); 완료 vibrate([60,80,60,80,120]);

// 셔플 (랜덤 변주)
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

// 토스트 (마일스톤 축하)
let _tt;
function toast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(_tt); _tt=setTimeout(()=>t.classList.remove('show'),2200);
}

// 색 변주: 누를 때마다 포인트 색을 바꿔 '매번 새로움'
const HUES=[{a1:"#ffd56b",a2:"#ffb347"},{a1:"#7fdfff",a2:"#5b8aff"},
            {a1:"#a0f0a0",a2:"#4fd1a0"},{a1:"#ff9ecb",a2:"#ff6b9e"},{a1:"#ffb38a",a2:"#ff7a5b"}];
function varyHue(i){
  const h=HUES[i%HUES.length], r=document.documentElement.style;
  r.setProperty('--accent1',h.a1); r.setProperty('--accent2',h.a2);
}
```

토스트용 CSS:
```css
.toast{
  position:fixed; left:50%; top:84px; transform:translateX(-50%) translateY(-20px);
  background:rgba(36,26,61,.96); border:1.5px solid var(--accent2); color:var(--cream);
  padding:13px 20px; border-radius:99px; font-size:14px; opacity:0; pointer-events:none;
  transition:opacity .4s, transform .4s; z-index:50; max-width:90vw;
}
.toast.show{opacity:1; transform:translateX(-50%) translateY(0);}
```

## 5. 점층 색 테마 (따뜻 → 뜨겁게)

단계가 깊어질수록 색이 뜨거워지면 "더 가까워진다/어려워진다"가 몸으로 느껴진다.

```js
const THEMES={
 1:{a1:"#ffd56b",a2:"#ffb347",bg1:"#1a1230",bg2:"#2d1b4e",card:"#241a3d"}, // 노랑(가벼움)
 2:{a1:"#ff8a5b",a2:"#ff6b6b",bg1:"#221031",bg2:"#3a1840",card:"#2c1838"}, // 코랄(중간)
 3:{a1:"#ff5e8a",a2:"#c44ec4",bg1:"#250d2e",bg2:"#3d1240",card:"#311236"}  // 핑크(깊음)
};
function applyTheme(t){
  const r=document.documentElement.style;
  r.setProperty('--accent1',t.a1); r.setProperty('--accent2',t.a2);
  r.setProperty('--bg1',t.bg1); r.setProperty('--bg2',t.bg2); r.setProperty('--card',t.card);
}
// 단계 넘어갈 때: applyTheme(THEMES[stage]); toast('🔥 다음 단계'); vibrate([20,40,20]);
```

## 6. 완주 보상 화면

끝까지 한 사람만 보는 화면을 반드시 둔다. 예: SVG 카운트다운 링.

```js
// R=반지름, C=둘레. fg circle의 stroke-dashoffset을 0→C로 움직여 채운다.
const R=76, C=2*Math.PI*R;
fg.style.strokeDasharray=C; fg.style.strokeDashoffset=0;
// 매 초: fg.style.strokeDashoffset = C*(1 - left/total);
```
타이머·완독 리포트·뱃지·점수·공유 버튼 등 결과물 성격에 맞게. 완료 진동 패턴으로 마침표를 찍는다.

## 7. 마무리 자가 점검 체크리스트

빌드 후 아래를 전부 통과해야 전달한다.

- [ ] 핵심 메시지 한 줄이 결과물에서 분명히 전달되는가 (의미)
- [ ] 도파민 7요소 중 4개 이상 적용했는가 (재미)
- [ ] 모든 탭/클릭에 0.3초 내 반응이 있는가
- [ ] 진행 시각화 + 완주 보상이 있는가
- [ ] 모바일(폰)에서 완벽히 동작하는가 (`100dvh`, 큰 터치 타깃)
- [ ] `prefers-reduced-motion`을 존중하는가
- [ ] 키보드 포커스가 보이는가
- [ ] 하단에 미미팩토리 브랜드 푸터가 그대로 들어갔는가 (`assets/brand-footer.html`)
- [ ] 단일 HTML이고 미리보기가 켜져 있는가
- [ ] 언어가 한국어인가
