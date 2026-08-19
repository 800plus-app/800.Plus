/* ⚠ prop=extracts החזיר אורך 0 לשלושת הדפים — התוסף TextExtracts אינו מותקן
 * בוויקיטקסט. אפס שמגיע מ-API לא נתמך אינו נתון, וזה הלקח שנרשם כבר פעם אחת. */
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };
const sleep=()=>new Promise(r=>setTimeout(r,300));
async function pageText(title){
  const r = await fetch('https://fr.wikisource.org/w/api.php?action=parse&prop=text&format=json'+
    '&formatversion=2&page='+encodeURIComponent(title),{headers:UA});
  await sleep();
  if(!r.ok) return {err:'HTTP '+r.status};
  const j = await r.json();
  if (j.error) return {err:j.error.code+': '+j.error.info};
  return {txt:String(j.parse.text).replace(/<[^>]+>/g,' ').replace(/&#\d+;/g,'').replace(/\s+/g,' ')};
}
(async()=>{
  for (const [title, needle] of [
      ['L’Encyclopédie/1re édition/VIMAIRE','force majeure'],
      ['Dictionnaire de l’administration française/AVARIE','force majeure'],
      ['Les Mamelles de Tirésias','surréaliste']]) {
    const {txt,err} = await pageText(title);
    console.log(`\n${title}`);
    if (err) { console.log('   ⛔ שגיאת API: '+err); continue; }
    const i = txt.indexOf(needle);
    console.log(i>=0 ? `   ✓ «...${txt.slice(Math.max(0,i-200),i+70).trim()}...»`
                     : `   ⛔ "${needle}" לא בדף (אורך ${txt.length})`);
  }
})();
