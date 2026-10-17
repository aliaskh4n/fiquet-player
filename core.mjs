export const formatTime = value => {
  const s = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export function formatCount(n,forms=['запись','записи','записей']){const last=Math.abs(n)%100,one=last%10;return `${n} ${last>=11&&last<=14?forms[2]:one===1?forms[0]:one>=2&&one<=4?forms[1]:forms[2]}`}
export function cleanTitle(raw) {
  return String(raw || 'Без названия').normalize('NFC')
    .replace(/\.mp3\s*$/i, '').replace(/^(?:полный\s+кавер|полная\s+версия|кавер\s+на)\s*/i, '')
    .replace(/(?:[,\s-]+кавер(?:\s+от\s+дар[ри]?)?|\s+от\s+дарр?|\s+дарр?)\s*$/i, '')
    .replace(/[«»]/g, '').replace(/\s+/g, ' ').trim() || String(raw);
}
export function normalizeSource(value) {
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`);
    if (['t.me', 'telegram.me', 'www.t.me'].includes(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 's') parts.shift();
      if (parts[1] && /^\d+$/.test(parts[1])) return `https://t.me/${parts[0]}/${parts[1]}`;
    }
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch { return value; }
}
export function filterTracks(tracks, {scope='cover', query='', favorites=[]}={}) {
  const q = query.trim().toLocaleLowerCase('ru');
  const source = /(?:t\.me|telegram\.me)\//.test(q) ? normalizeSource(q) : null;
  return tracks.filter(t => {
    if (source) return t.source_url === source || t.related_urls?.includes(source);
    if (scope === 'favorites' && !favorites.includes(t.id)) return false;
    if (scope === 'full' && (!t.full_length || t.status !== 'ready')) return false;
    if (scope === 'karaoke' && (!t.lyrics_ready || t.status !== 'ready')) return false;
    if (scope === 'cover' && (!['cover','music'].includes(t.classification) || t.status !== 'ready')) return false;
    if (scope === 'candidate' && (t.classification !== 'candidate' || t.status !== 'ready')) return false;
    if (scope === 'all' && t.status !== 'ready') return false;
    if (scope === 'unavailable' && t.status !== 'unavailable') return false;
    return !q || [t.title,t.display_title,t.caption,t.source_url].some(v=>String(v||'').toLocaleLowerCase('ru').includes(q));
  });
}
export function shuffleQueue(ids, current, random=Math.random) {
  const rest = ids.filter(id => id !== current);
  for (let i=rest.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [rest[i],rest[j]]=[rest[j],rest[i]]; }
  return current && ids.includes(current) ? [current,...rest] : rest;
}
export function nextId(queue, current, {direction=1, repeat='off', ended=false}={}) {
  if (!queue.length) return null;
  if (ended && repeat==='one' && queue.includes(current)) return current;
  const i=queue.indexOf(current);
  if (i<0) return direction>0 ? queue[0] : queue.at(-1);
  const next=i+direction;
  if (next>=0 && next<queue.length) return queue[next];
  return repeat==='all' ? queue[(next+queue.length)%queue.length] : null;
}
export function telegramThemeVars(params={}){
  const vars={};
  for(const key of ['bg_color','text_color','hint_color','link_color','button_color','button_text_color','secondary_bg_color','header_bg_color','bottom_bar_bg_color','accent_text_color','section_bg_color','section_header_text_color','subtitle_text_color','section_separator_color','destructive_text_color'])
    if(/^#[0-9a-f]{6}$/i.test(params[key]||''))vars['--tg-theme-'+key.replaceAll('_','-')]=params[key];
  return vars;
}
export function transcriptLines(data,duration=Infinity){
  if(!Array.isArray(data?.lines))return [];
  return data.lines.filter(l=>typeof l.text==='string'&&l.text.trim()&&Number.isFinite(l.start)&&l.start>=0&&l.start<duration&&Number.isFinite(l.end)&&l.end>l.start&&l.end<=duration+1)
    .map(l=>({time:l.start,end:l.end,text:l.text.trim().normalize('NFC')})).sort((a,b)=>a.time-b.time);
}
export function activeLyric(lines, time, offset=0) {
  let index=-1;
  for(let i=0;i<lines.length;i++) {if(lines[i].time<=time+offset)index=i;else break;}
  return index;
}
