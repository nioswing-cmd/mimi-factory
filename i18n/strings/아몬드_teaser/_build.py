# -*- coding: utf-8 -*-
import json, collections

KO = json.load(open('i18n/strings/아몬드_teaser/ko.json'))

# key -> (ja, en, zh-tw)
T = {}

T["title_001"] = ("アーモンド ドーパミンマスタークイズ", "Almond — Dopamine Master Quiz", "杏仁 多巴胺大師測驗")

T["html_001"] = ("ソン・ウォンピョン · 2017 · チャンビ青少年文学賞 受賞作", "Sohn Won-pyung · 2017 · Changbi Young Adult Literature Award winner", "孫元平 · 2017 · 創批青少年文學獎 得獎作")
T["html_002"] = ("感情を感じられない少年が、世界とぶつかりながら育っていく物語", "A boy who can’t feel emotions, growing up as he collides with the world", "一個感受不到情緒的少年，在與世界碰撞中成長的故事")
T["html_003"] = ("アーモンド マスタークイズ", "Almond Master Quiz", "杏仁 大師測驗")
T["html_004"] = ("「感情のない子どもにも、世界はいつか語りかけてくる。」", "“Even to a child with no feelings, the world speaks in the end.”", "「就算是沒有情緒的孩子，世界最終仍會向他開口。」")
T["html_005"] = ("— 小説『アーモンド』が投げかける問い", "— the question the novel “Almond” asks", "— 小說《杏仁》提出的提問")
T["html_006"] = ("ユンジェの物語と、この小説の人物 · テーマ · 象徴を", "You’ll master Yunjae’s story and this novel’s characters, themes, and symbols through", "允在的故事，以及這本小說的人物 · 主題 · 象徵，用")
T["html_007"] = ("30問のクイズ", "30 quiz questions", "30 道題")
T["html_008"] = ("で身につけます。\n        やさしい問題から始まってだんだん難しくなり、", ".\n        They start easy and get harder, and", "一題一題學會。\n        從簡單開始、越來越難，而且")
T["html_009"] = ("まちがえた問題は正解するまで何度でも戻ってきます。", "any question you get wrong comes back until you nail it.", "答錯的題目會一直回來，直到你答對為止。")
T["html_010"] = ("全", "Total", "共")
T["html_011"] = ("30問", "30 questions", "30 題")
T["html_012"] = ("やさしい → 難しい", "Easy → Hard", "簡單 → 困難")
T["html_013"] = ("リアルタイム", "Live", "即時")
T["html_014"] = ("感情の目覚め", "emotional awakening", "情緒的覺醒")
T["html_015"] = ("問題ごとに", "Every question,", "每題都有")
T["html_016"] = ("やさしい解説", "a simple explanation", "白話解說")
T["html_017"] = ("アーモンドを目覚めさせる →", "Wake the almond →", "喚醒杏仁 →")
T["html_018"] = ("スコア", "Score", "分數")
T["html_019"] = ("連続正解", "Streak", "連續答對")
T["html_020"] = ("マスター", "Mastered", "精通")
T["html_021"] = ("無感覚 ←", "Numb ←", "無感 ←")
T["html_022"] = ("感情が目覚める旅 ·", "The journey of awakening emotions ·", "情緒覺醒的旅程 ·")
T["html_023"] = ("→ 共感", "→ Empathy", "→ 共感")
T["html_024"] = ("やさしい", "Easy", "簡單")
T["html_025"] = ("次へ →", "Next →", "下一題 →")
T["html_026"] = ("ここまでが無料プレビューです", "That’s the end of the free preview", "免費試玩到這裡為止")
T["html_027"] = ("🔑 購読して全部開く", "🔑 Subscribe to unlock everything", "🔑 訂閱解鎖全部")
T["html_028"] = ("読了レポートをプレビュー →", "Preview the Reading Report →", "預覽完讀報告 →")
T["html_029"] = ("アーモンドを目覚めさせた人", "The one who woke the almond", "喚醒杏仁的人")
T["html_030"] = ("最終スコア", "Final score", "最終分數")
T["html_031"] = ("初回正解率", "First-try accuracy", "首次答對率")
T["html_032"] = ("最高連続正解", "Best streak", "最高連續答對")
T["html_033"] = ("総チャレンジ回数", "Total attempts", "總挑戰次數")
T["html_034"] = ("📖 読了レポート全体を見る", "📖 See the full Reading Report", "📖 看完整完讀報告")
T["html_035"] = ("🖼 結果カードを保存", "🖼 Save result card", "🖼 儲存結果卡")
T["html_036"] = ("もう一度挑戦 ↻", "Try again ↻", "再挑戰一次 ↻")
T["html_037"] = ("最初に戻る", "Back to start", "回到開始")
T["html_038"] = ("読了レポート · INFOGRAPHIC", "Reading Report · INFOGRAPHIC", "完讀報告 · INFOGRAPHIC")
T["html_039"] = ("アーモンド ひと目で", "Almond at a glance", "杏仁 一眼看懂")
T["html_040"] = ("小説全体を", "Thread the whole novel onto", "把整本小說用")
T["html_041"] = ("「感情が目覚める旅」", "‘the journey of awakening emotions’", "「情緒覺醒的旅程」")
T["html_042"] = ("ひとつの線でつなげば、絶対に忘れません。すべての出発点は", "and you’ll never forget it. Where it all begins is", "一條線串起來，就絕對忘不了。一切的起點是")
T["html_043"] = ("小さなアーモンド（扁桃体）", "a small almond (the amygdala)", "小小的杏仁（杏仁核）")
T["html_044"] = ("です。", ".", "。")
T["html_045"] = ("出発点", "Start", "起點")
T["html_046"] = ("🧠 小さなアーモンド（扁桃体）", "🧠 A small almond (amygdala)", "🧠 小小的杏仁（杏仁核）")
T["html_047"] = ("感情をうまく感じられない子", "A child who can barely feel", "感受不太到情緒的孩子")
T["html_048"] = ("ステップ1", "Step 1", "第 1 步")
T["html_049"] = ("👵 家族の愛", "👵 A family’s love", "👵 家人的愛")
T["html_050"] = ("母の教え、おばあちゃんの『きれいな怪物』", "Mom’s lessons, Grandma’s ‘pretty monster’", "媽媽的教導、外婆的『漂亮怪物』")
T["html_051"] = ("ステップ2", "Step 2", "第 2 步")
T["html_052"] = ("🔪 あの日の惨劇", "🔪 The tragedy that day", "🔪 那天的慘案")
T["html_053"] = ("おばあちゃんの死、母の昏睡", "Grandma’s death, Mom’s coma", "外婆離世、媽媽昏迷")
T["html_054"] = ("展開", "Rising action", "發展")
T["html_055"] = ("🤝 ゴニとの友情", "🤝 Friendship with Gon-i", "🤝 與坤伊的友情")
T["html_056"] = ("欠乏と過剰が、たがいを映し合う", "Lack and excess mirror each other", "匱乏與過剩，彼此映照")
T["html_057"] = ("結果", "Payoff", "結果")
T["html_058"] = ("❤️ 目覚める感情", "❤️ Emotions awakening", "❤️ 甦醒的情緒")
T["html_059"] = ("「共感を学ぶ成長」", "“Growing by learning empathy”", "「學會共感的成長」")
T["html_060"] = ("核心コンセプト 8", "8 key concepts", "8 個核心概念")
T["html_061"] = ("目次をひと目で", "The table of contents at a glance", "目錄一眼看懂")
T["html_062"] = ("タップすると要約が開きます", "Tap to open the summary", "點一下就展開摘要")
T["html_063"] = ("作品の中の、考えてみたい場面 3", "3 moments from the book worth pondering", "書中值得思考的 3 個場景")
T["html_064"] = ("この本が私たちに投げかける問い 3", "3 questions this book asks us", "這本書丟給我們的 3 個問題")
T["html_065"] = ("まちがえたところを集中復習", "Focused review of what you missed", "針對答錯的地方重點複習")
T["html_066"] = ("📺 もっと深く知りたいなら", "📺 Want to go deeper?", "📺 想更深入了解的話")
T["html_067"] = ("で『アーモンド』のテーマと人物をさらに深く見ていけます。", " lets you dig deeper into the themes and characters of “Almond”.", "，可以更深入了解《杏仁》的主題與人物。")
T["html_068"] = ("📄 PDFで保存", "📄 Save as PDF", "📄 存成 PDF")
T["html_069"] = ("結果へ", "Back to results", "回到結果")
T["html_070"] = ("📚 ほかの本のクイズを見る →", "📚 See quizzes for other books →", "📚 看其他書的測驗 →")
T["html_071"] = ("「意味と面白さの工場」ミミファクトリー", "“The Meaning & Fun Factory” MIMI FACTORY", "「意義與趣味工廠」咪咪工廠")
T["html_072"] = ("（株式会社ヨンギョル ファミリーカンパニー）", "(YEON:GYEOL Inc. Family Company)", "（YEON:GYEOL股份有限公司 家族公司）")
T["html_073"] = ("本のエッセンスをドーパミンで身につける、反復マスタークイズ", "A repeat-mastery quiz that turns a book’s core into dopamine", "用多巴胺記住一本書精華的反覆大師測驗")
T["html_074"] = ("本アプリは、書籍の核心的な概念を学習目的で再構成した二次的な学習コンテンツです。完全な読書体験は、ぜひ原書でお楽しみください。", "This app is secondary learning content that reworks the book’s key ideas for study. For the full reading experience, please pick up the original book.", "本 App 是為了學習目的、將書籍核心概念重新編排的二次學習內容。完整的閱讀體驗，請透過原著親自感受。")
T["html_075"] = ("アーモンド · 書籍情報", "Almond · Book info", "杏仁 · 書籍資訊")

import _build_js  # noqa
T.update(_build_js.T)
import _build_js2  # noqa
T.update(_build_js2.T)

META = {
 "ja": {"lang": "ja", "note": "책 마스터 퀴즈 장르 · です・ます체 · glossary 고정 · 곧은따옴표 금지"},
 "en": {"lang": "en", "note": "book-quiz tone · curly apostrophes only · glossary locked"},
 "zh-tw": {"lang": "zh-tw", "note": "台灣繁體 · 書籍測驗語氣 · 禁用直引號 · glossary 固定"},
}
APP = {
 "ja": {"id": "아몬드_teaser", "file": "almond", "title": "アーモンド マスタークイズ", "desc": "感情を感じられない少年の物語を、30問で読み解く読書クイズ"},
 "en": {"id": "아몬드_teaser", "file": "almond", "title": "Almond Master Quiz", "desc": "The boy who couldn’t feel — read the novel through 30 quiz questions."},
 "zh-tw": {"id": "아몬드_teaser", "file": "almond", "title": "杏仁 大師測驗", "desc": "感受不到情緒的少年——用 30 道題讀懂這本小說"},
}
IDX = {"ja": 0, "en": 1, "zh-tw": 2}

keys = [k for k in KO if k != "_meta"]
missing = [k for k in keys if k not in T and k != "js_001"]
assert not missing, "MISSING: %s" % missing

for lang, i in IDX.items():
    out = collections.OrderedDict()
    out["_meta"] = META[lang]
    for k in keys:
        if k == "js_001":
            out[k] = KO[k]["t"]
        else:
            out[k] = T[k][i]
    out["_app"] = APP[lang]
    fn = "i18n/strings/아몬드_teaser/%s.json" % lang
    with open(fn, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", fn, len(out), "keys")
