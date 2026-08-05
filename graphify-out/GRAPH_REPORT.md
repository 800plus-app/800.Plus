# Graph Report - 800+  (2026-08-04)

## Corpus Check
- 89 files · ~237,460 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1532 nodes · 3249 edges · 100 communities (95 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 137 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b0aa0ed2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 99|Community 99]]

## God Nodes (most connected - your core abstractions)
1. `n()` - 83 edges
2. `$()` - 71 edges
3. `_returnResult()` - 44 edges
4. `Y()` - 42 edges
5. `appSource()` - 37 edges
6. `constructor()` - 36 edges
7. `loadApp()` - 34 edges
8. `join()` - 31 edges
9. `handleOperation()` - 30 edges
10. `push()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `fillStats()` --calls--> `isObj()`  [INFERRED]
  tests/29-pull-account.test.js → app.js
- `openStats()` --calls--> `CLOUD`  [INFERRED]
  app.js → tests/29-pull-account.test.js
- `buildBank()` --calls--> `add()`  [INFERRED]
  app.js → supabase.min.js
- `constructor()` --calls--> `b`  [INFERRED]
  supabase.min.js → tests/28-answerable.test.js
- `Rr()` --calls--> `W`  [INFERRED]
  supabase.min.js → tests/35-was-right-sense.test.js

## Import Cycles
- None detected.

## Communities (100 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (29): clone(), close(), closeAndRetry(), Cn(), Ct(), En(), Et(), Ge() (+21 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (88): ACC_TABS, added, admUsers, admView, applyUpdate(), assoc, BANK, BUILD (+80 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (51): $(), accessOk(), admFilterSort(), afterAuthed(), askSize(), backFromAuth(), bindCacheToUser(), bindSay() (+43 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (42): absorbDisk(), applyExtras(), buildBank(), collectExtras(), commitSession(), deleteWord(), enterLang(), examPreFor() (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (28): answerCard(), loadApp(), practiseRound(), startRound(), assert, fresh(), { loadApp, startRound, practiseRound, answerCard, expectNone }, none() (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (36): _adminDeletePasskey(), _adminListPasskeys(), _createCustomProvider(), _createOAuthClient(), createUser(), _deleteCustomProvider(), _deleteFactor(), _deleteOAuthClient() (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (47): buildGlossIndex(), celebrateUnit(), check(), classify(), creditSense(), exDistract(), exWriteOk(), finishCard() (+39 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (25): expectNone(), assert, fs, LANGS, { loadApp, banks, expectNone, ROOT }, MARKER, none(), path (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (32): copy(), createBucket(), createIndex(), createSignedUploadUrl(), createSignedUrl(), createSignedUrls(), deleteBucket(), deleteIndex() (+24 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (23): extractAll(), appSource(), lift(), { appSource }, assert, at(), { extractAll }, { test, describe } (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (18): { codeMask, codeMatches }, ERRORS, { extractFunction }, fs, liftAsync(), { loadApp }, loadStore(), loadSyncLayer() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (49): build(), canPush(), connect(), connectionState(), connectWithFallback(), Dn(), _fetchWithTimeout(), getSocket() (+41 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (29): channel(), ci(), constructor(), detectEnvironment(), Fn(), ft(), getChannel(), getChannels() (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (8): app, { appSource, ROOT }, assert, fs, html, path, STEPS, { test, describe }

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (23): acceptListFor(), assert, buildSweep(), { codeMask, codeMatches, statementEnd }, en, EXTRA, { extractAll }, fs (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (25): _approveAuthorization(), _deletePasskey(), _denyAuthorization(), _emitInitialSession(), _enroll(), _getAuthorizationDetails(), linkIdentity(), linkIdentityIdToken() (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (33): Ar(), assertFieldSize(), binaryEncode(), cloneRequestState(), containedBy(), contains(), delete(), encode() (+25 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (22): 10 · "יושבות" — מונח שנדחה, 11 · נקודה בסוף שורת תיאור, 12 · `lang="en"` על שדות שמציגים אנגלית, 13 · `aria-label` לכפתור החשבון, 14 · "כל המאגר" ו"אקראי" נראים זהים, 1 · supabase.min.js חייב להיות ב-CORE, 2 · כפתור "אחורה" באנדרואיד יוצא מהאפליקציה באמצע סבב, 3 · מחיקת חשבון לא מנקה את המטמון `hw-data` (+14 more)

### Community 18 - "Community 18"
Cohesion: 0.24
Nodes (12): allCards(), learnedCards(), newCards(), openScope(), renderWordCard(), uniqScope(), wcDismiss(), wcDismissed() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (36): _cancelPendingDisconnect(), cancelRefEvent(), cancelTimeout(), clearHeartbeats(), destroy(), disconnect(), flushSendBuffer(), hasLogger() (+28 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (26): add(), ajax(), appendParams(), batchSend(), endpointURL(), eq(), gte(), ilike() (+18 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (16): exchangeCodeForSession(), gi(), _i(), _notifyAllSubscribers(), _saveSession(), setSession(), signInAnonymously(), signInWithEthereum() (+8 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (8): app, { appSource, ROOT }, assert, fs, html, LV_BLOCK, path, { test, describe }

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (19): 10. מה שעוד לא נעשה — כדי שהמסמך יישאר כלי ולא תצהיר, 11. מדידת כיסוי מול מקורות בלתי-תלויים, 12. הומוגרפים — למה פיצול לשני ערכים אינו אפשרי, ומה נעשה במקום, 13. ביקורת נתונים נוכחית — הפרדה בין רמת הנתונים לרמת המנוע, 1. מאיפה הגיעו המועמדים, 2. מבנה המאגר כפי שהוא היום, 3. ניקוי כפילויות ונרמול — עבודה שלא הייתה במקור, 4. ביקורת פירושים ותרגומים — 20 סוכני ביקורת ואימות כפול (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (14): app, appMask, { appSource, ROOT }, assert, { codeMask }, contrast(), css, { extractFunction } (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.16
Nodes (26): _acquireLock(), _autoRefreshTokenTick(), _callRefreshToken(), _debug(), dispose(), _getSessionFromURL(), _handleProviderSignIn(), _handleVisibilityChange() (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (19): createNamespace(), createNamespaceIfNotExists(), createTable(), createTableIfNotExists(), D(), dropNamespace(), dropTable(), fi() (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (6): assert, files, fs, path, { ROOT }, { test, describe }

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (13): codeMask(), KEYWORDS, regexStarts(), skipQuoted(), skipRegex(), { appSource }, assert, { codeMask, codeMatches } (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (10): app, assert, ctxFor(), EN, { extractAll }, HE, { loadApp, appSource, banks, expectNone }, none() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (12): banks(), { appSource, banks, plain, expectNone }, assert, { extractAll }, lifted(), loadStorage(), makeDocument(), makeLocalStorage() (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (8): { appSource, ROOT }, assert, { codeMask }, { extractHandler }, fs, PAIRS, path, { test, describe }

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (13): _binaryDecode(), _binaryEncodeUserBroadcastPush(), decode(), decodeBroadcast(), decodePush(), decodeReply(), _decodeUserBroadcast(), _encodeBinaryUserBroadcastPush() (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (11): REQUIRED, tagOf(), braceBalance(), assert, { codeMask, braceBalance, matchBrace }, { extractFunction, extractDecl }, fs, { loadApp, banks, appSource, plain, tagOf, REQUIRED, ROOT } (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.16
Nodes (12): assert, clone(), ctx, FIELDS, forAll(), GROWING, KEYS, { loadApp, plain } (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (15): app, appMask, { appSource, ROOT }, assert, { codeMask }, decl(), { extractFunction, extractDecl }, fbContextKeys() (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (7): ROOT, assert, fs, path, { ROOT }, src, { test, describe }

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (14): Current status, Files, Gotcha for whoever edits these, How the tests reach into `app.js`, Named regressions locked in, Proof the suite can fail, Run, tests/ (+6 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (13): 0:00–0:06 · הכאב, 0:06–0:14 · למה זה קורה, 0:14–0:26 · מה עושים אחרת, 0:26–0:38 · הסבב עצמו, 0:38–0:50 · מה שאין באחרים, 0:50–1:02 · שהוא באמת יראה את זה, 1:02–1:12 · הסגירה, הפקה (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.19
Nodes (10): enc, hmacHex(), json(), Norm, PROVIDER_MAP, reVerifyWithProvider(), safeEq(), STATUS_MAP (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.17
Nodes (10): app, { appSource, ROOT }, assert, { codeMask }, { extractHandler, extractFunction, extractDecl }, fs, html, mask (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (4): app, { appSource }, assert, { test, describe }

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (12): 1. מה חייב לעבור, לפי סדר, 2. השם והזהות, 3. מה מותר להגיד — ומה אסור, 4. מה להראות מהמוצר, 5. המחיר — איך להציג אותו, 6. הלוגו בסרטון, 7. אורך ופורמט, 8. הצעת חלוקת זמן ל-20 שניות (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (10): plain(), assert, ctx, { loadApp, plain, expectNone }, merge(), none(), P(), rich_() (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (13): ai(), _authenticate(), _challenge(), _challengeAndVerify(), createNewAbortSignal(), ji(), ki(), Oi() (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (6): Di(), dr(), ei(), _refreshAccessToken(), toJSON(), z()

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (10): assert, ctx, { extractAll }, fs, path, { ROOT }, src, SW (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (11): app, applyKnown(), assert, DATA, en, { extractAll }, { loadApp, appSource, banks }, RANK (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.36
Nodes (10): { codeMask, matchBrace, statementEnd, codeMatches }, escapeName(), extractDecl(), extractFunction(), extractHandler(), codeMatches(), matchBrace(), statementEnd() (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (10): למה זה בנוי כך, למה זה בנוי כך, למה נוספו כאן ארבע שניות למסלול ההצצה, מה המחקר אומר — ועל מה בניתי את שניהם, מה לבדוק לפני שאתה מעלה, פרומטים לייצור (העתק-הדבק), פרומטים לייצור (העתק-הדבק), שני תסריטים לסרטוני פרסומת — 800+ (+2 more)

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (9): pgError(), app, { appSource, ROOT }, assert, fs, html, { loadStore, pgError }, path (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (25): applyTransformOptsToQuery(), catch(), download(), execute(), exists(), fetchRequest(), finally(), _getFinalPath() (+17 more)

### Community 52 - "Community 52"
Cohesion: 0.20
Nodes (9): ROOT, assert, { codeMask, codeMatches }, { extractFunction }, fs, FULL_BLOB, { loadStore, ROOT }, path (+1 more)

### Community 53 - "Community 53"
Cohesion: 0.20
Nodes (7): app, assert, ctx, { extractAll }, { loadApp, appSource }, { test, describe }, vm

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (9): 🎨 `לוגו-ואייקונים/`, לפני שמפרסמים · צ'קליסט, ✉️ `מיילים/`, 📹 `סרטונים/`, 🎨 `עיצוב-אתר/`, 📊 `תוכניות/`, תיקיית השיווק · 800+, 🖼 `תמונות/` (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.32
Nodes (7): assert, atWelcomeScreen(), cloudBeforePractice(), diskAfterOfflinePractice(), { loadSyncLayer }, { test, describe }, WORDS

### Community 56 - "Community 56"
Cohesion: 0.36
Nodes (8): count(), days_old(), drive_has(), git_tracked(), main(), newest(), הקובץ העדכני ביותר תחת נתיב, כחותמת זמן. None כשאין., האם הנתיב באמת נמצא במאגר. `git ls-files` ולא בדיקת .gitignore — קובץ יכול

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (16): Br(), fr(), G(), _getCodeChallengeAndMethod(), _getUrlForProvider(), h(), ir(), Lr() (+8 more)

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (7): app, assert, ctx, { extractAll }, { loadApp, appSource }, { test, describe }, vm

### Community 59 - "Community 59"
Cohesion: 0.25
Nodes (7): app, assert, ctx, { loadApp, appSource }, rec(), side(), { test, describe }

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (7): failures, files, fs, path, { run }, { spec }, stream

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (8): 1 · Confirm signup, 2 · Reset password, 3 · Magic Link, 4 · Change Email Address, אחרי ההדבקה — שתי בדיקות, למה זה נראה כמו שזה נראה — ולא כמו האתר, מה שלא לעשות, תבניות המייל · להדבקה בסופאבייס

### Community 62 - "Community 62"
Cohesion: 0.25
Nodes (6): body(), mask(), ראה pick_nudges.mask — המאגר פומבי, ולוג פומבי הוא פרסום., שורת הנושא.      "עומדות ליפול לך מהזיכרון" היה דימוי, ודימוי תופס את מקום המי, גוף המייל.      הלחץ שמזיז אדם הוא תאריך אמיתי שהוא בעצמו הזין, ולא ניסוח דחוף, subject()

### Community 63 - "Community 63"
Cohesion: 0.29
Nodes (4): ASSETS, composeDaily(), CORE, showDaily()

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (7): app, assert, ctx, { extractAll }, { loadApp, appSource }, { test, describe }, vm

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (17): buildSheet(), cap(), capSampled(), exBuild(), exChosen(), exLenKey(), exTake(), exTestable() (+9 more)

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (6): אפשרות א — הכי מהיר (שורת פקודה), אפשרות ב — דרך האתר (בלי פקודות), בטלפון, הערת זכויות ומקור, עדכון מילים בעתיד, פריסה לטלפון (GitHub Pages) — נשאר רק צעד אחד שלך

### Community 67 - "Community 67"
Cohesion: 0.25
Nodes (7): app, { appSource, ROOT }, assert, fs, html, path, { test, describe }

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (4): app, { appSource }, assert, { test, describe }

### Community 69 - "Community 69"
Cohesion: 0.29
Nodes (4): assert, ctx, { loadApp }, { test, describe }

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (5): assert, en, he, { loadApp, banks, expectNone }, { test, describe }

### Community 71 - "Community 71"
Cohesion: 0.29
Nodes (6): app, { appSource }, assert, at, body, { test, describe }

### Community 72 - "Community 72"
Cohesion: 0.29
Nodes (6): app, { appSource }, assert, at, body, { test, describe }

### Community 73 - "Community 73"
Cohesion: 0.29
Nodes (6): ההחלטה שמאחורי שלושתם, הסדר שבו כדאי להעלות, מה כדאי להוסיף בשכבת הטקסט של אינסטגרם, מה שאני יכול לעשות ומה שלא, מה שלא בדקתי, ואני אומר את זה במפורש, תכנית שיווק · שלושה סטוריז

### Community 74 - "Community 74"
Cohesion: 0.29
Nodes (6): הערות צילום, מה **לא** נכנס, מה שהסרטון חייב להשיג, מוזיקה — רק מהמקורות האלה, סרטון הדרכה לבודקי ה-MVP — 45 שניות, פירוק לפי שניות

### Community 75 - "Community 75"
Cohesion: 0.40
Nodes (4): days_since(), mask(), הלוגים של Actions גלויים לכל מי שרואה את המאגר, והמאגר הזה פומבי. כתובת מלאה לצד, ts()

### Community 76 - "Community 76"
Cohesion: 0.53
Nodes (5): fetch(), gh(), live_counts(), main(), כמה שורות יש עכשיו בייצור. דורש SUPABASE_SERVICE_KEY; בלעדיו הבדיקה מדולגת

### Community 77 - "Community 77"
Cohesion: 0.60
Nodes (4): b64url(), importKey(), unb64url(), vapidHeader()

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (6): hasProgressIn(), lvEstimate(), lvFinish(), lvKey(), lvNextBand(), lvRender()

### Community 79 - "Community 79"
Cohesion: 0.33
Nodes (5): supabase/ — פונקציות הקצה ונהלי ההפעלה, א. נוהל הפריסה — פעם אחת, לא ביום ההפעלה, ב. נוהל ההדלקה — הצעדים שיש בהם דרך אחת, ג. כיבוי חירום — שתי שורות, שניות, בלי deploy, ד. מה עוד חסר, בכוונה

### Community 80 - "Community 80"
Cohesion: 0.08
Nodes (19): APP, { extractAll }, fs, path, SYMBOLS, vm, assert, en (+11 more)

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): assert, CLOUD, fillStats(), LOG, { test, describe }

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (5): app, { appSource }, assert, signOut, { test, describe }

### Community 83 - "Community 83"
Cohesion: 0.33
Nodes (5): איפה לראות את זה עובד, הטיפוגרפיה, הכלל שמסביר את הפלטה, הפלטה · `index.html`, בלוק `:root`, עיצוב כללי · 800+

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (4): מה שחסר כדי לשלוח באמת, מיילי תזכורת · טיוטה לאישור, נרשם ולא התחיל, שתי החלטות שקיבלתי, ואפשר להפוך

### Community 85 - "Community 85"
Cohesion: 0.40
Nodes (6): ae(), ie(), oe(), re(), se(), v()

### Community 99 - "Community 99"
Cohesion: 0.33
Nodes (4): app, { appSource }, assert, { test, describe }

## Knowledge Gaps
- **507 isolated node(s):** `LS`, `LANG`, `assoc`, `stats`, `deleted` (+502 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `add()` connect `Community 20` to `Community 0`, `Community 3`, `Community 11`, `Community 16`, `Community 51`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `buildBank()` connect `Community 3` to `Community 1`, `Community 20`, `Community 6`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `b` connect `Community 25` to `Community 70`, `Community 12`, `Community 44`, `Community 15`, `Community 21`, `Community 57`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Are the 75 inferred relationships involving `n()` (e.g. with `_adminDeletePasskey()` and `_adminListPasskeys()`) actually correct?**
  _`n()` has 75 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LS`, `LANG`, `assoc` to the rest of the system?**
  _514 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.024950495049504952 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.029166666666666667 - nodes in this community are weakly interconnected._