import {formatTime,formatCount,cleanTitle,filterTracks,shuffleQueue,nextId,activeLyric,telegramThemeVars,transcriptLines} from './core.mjs?v=22419c8678fd';

const $=id=>document.getElementById(id), audio=$('audio'), config=window.FIQUET_CONFIG||{};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('fiquet:'+key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem('fiquet:'+key,JSON.stringify(value));return true}catch{return false}};
const stored=read('session',{}), savedFavorites=read('favorites',[]);
const params=new URLSearchParams(location.search);
const scopes=['cover','full','all','candidate','unavailable','karaoke'];
const state={tracks:[],byId:new Map(),stats:{},view:'library',scope:scopes.includes(params.get('scope'))?params.get('scope'):'cover',query:'',visible:60,
  favorites:new Set(Array.isArray(savedFavorites)?savedFavorites.filter(Number.isInteger):[]),current:null,queue:[],shuffle:false,repeat:'off',menuTrack:null,lyric:null,lyricStatus:'idle',lyricRequest:0,loading:false,follow:true};
let saveTime=0,toastTimer,seekRestore=null,playRequest=0,seeking=false,lyricController=null;
const tg=window.Telegram?.WebApp;
const inTelegram=Boolean(tg?.initData);
function haptic(){try{if(inTelegram)tg.HapticFeedback?.selectionChanged()}catch{}}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800)}
function title(t){return t?.display_title||cleanTitle(t?.title)}
function sub(t){if(!t)return 'fiquet';const platform=t.source_url?.includes('soundcloud.com')?'SoundCloud':'Telegram';return `fiquet · ${t.full_length?'полная запись':t.classification==='music'?'исполнение / разбор':t.classification==='candidate'?'из архива':'кавер'} · ${platform}`}
function art(t,loading='lazy'){return t?.cover_url?`<img class="art-image" src="${esc(t.cover_url)}" alt="" loading="${loading}" decoding="async">`:'<div class="art-fallback"><span>f.</span></div>'}
function filtered(){return filterTracks(state.tracks,{scope:state.view==='favorites'?'favorites':state.scope,query:state.query,favorites:[...state.favorites]})}
function persist(){write('session',{id:state.current,time:audio.currentTime||0,queue:state.queue,shuffle:state.shuffle,repeat:state.repeat})}
function selected(){return state.byId.get(state.current)}
function safeSource(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}

function renderCatalog(){
  const rows=filtered(), shown=rows.slice(0,state.visible);
  $('list-count').textContent=formatCount(rows.length);
  const names={cover:'Все каверы и музыка',full:'Полные записи',karaoke:'Текст',all:'Вся музыка',candidate:'Музыкальные записи',unavailable:'Пока недоступны'};
  $('list-title').textContent=state.view==='favorites'?'Твои записи':state.query?'Результаты поиска':names[state.scope];
  $('filters').hidden=state.view==='favorites';
  document.querySelectorAll('[data-scope]').forEach(b=>b.classList.toggle('active',b.dataset.scope===state.scope));
  $('load-more').hidden=rows.length<=state.visible;
  $('track-list').innerHTML=shown.length?shown.map((t,i)=>{
    const current=t.id===state.current,liked=state.favorites.has(t.id),ready=Boolean(t.audio_url);
    return `<article class="track ${current?'active':''}" data-track="${t.id}"><span class="track-number">${current&&!audio.paused?'<span class="equalizer" aria-label="Играет"><i></i><i></i><i></i></span>':String(i+1).padStart(2,'0')}</span><div class="track-art">${art(t)}</div><button class="track-name" data-play="${t.id}" ${ready?'':'disabled'} aria-label="${ready?'Слушать':'Недоступно'}: ${esc(title(t))}"><strong>${esc(title(t))}</strong><small>${esc(ready?sub(t):t.error||'Файл пока недоступен')}</small></button><span class="track-duration">${t.duration_seconds?formatTime(t.duration_seconds):'—'}</span><button class="icon-button favorite" data-favorite="${t.id}" aria-pressed="${liked}" aria-label="${liked?'Удалить из':'Добавить в'} избранное: ${esc(title(t))}">${icon('heart')}</button><button class="icon-button" data-menu="${t.id}" aria-label="Действия: ${esc(title(t))}">${icon('more')}</button></article>`;
  }).join(''):`<div class="empty-state">${icon(state.view==='favorites'?'heart':'search')}<h3>${state.view==='favorites'?'Пока ничего не сохранено':'Ничего не нашлось'}</h3><p>${state.view==='favorites'?'Нажми на сердечко у понравившейся записи.':'Попробуй другое название или раздел библиотеки.'}</p></div>`;
  $('favorite-count').textContent=state.favorites.size;
}
function renderFeatured(){
  const full=state.tracks.filter(t=>t.full_length&&t.status==='ready');
  const picks=[1079,1071,1073,1081].map(id=>full.find(t=>t.id===id)).filter(Boolean);
  const chosen=picks.length===4?picks:full.slice(0,4);
  $('featured').innerHTML=chosen.map(t=>`<button class="featured-card" data-play="${t.id}" aria-label="Слушать: ${esc(title(t))}"><div class="featured-art">${art(t)}${t.lyrics_ready?'<span class="karaoke-badge">Текст</span>':''}<span class="featured-play">${icon('play')}</span></div><strong>${esc(title(t))}</strong><small>fiquet · ${formatTime(t.duration_seconds)}</small></button>`).join('');
}
function setView(view){
  state.view=view;state.query='';state.visible=60;$('search').value='';$('clear-search').hidden=true;
  $('hero').hidden=view!=='library';$('artist-sources').hidden=view!=='library';$('featured-section').hidden=view!=='library';$('search-section').hidden=view!=='search';$('favorites-heading').hidden=view!=='favorites';
  $('breadcrumb').textContent={library:'Твоя библиотека',search:'Поиск по архиву',favorites:'Твоё избранное'}[view];
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  renderCatalog();window.scrollTo({top:0,behavior:'instant'});if(view==='search')$('search').focus();haptic();
}
function setScope(scope){state.scope=scope;state.visible=60;const url=new URL(location.href);url.searchParams.set('scope',scope);history.replaceState(null,'',url);renderCatalog();haptic()}
function toggleFavorite(id){
  if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);
  write('favorites',[...state.favorites]);renderCatalog();renderCurrent();haptic();
}
function syncBack(){if(!inTelegram)return;try{document.querySelector('dialog[open]')?tg.BackButton.show():tg.BackButton.hide()}catch{}}
function showDialog(name){const d=$(name+'-dialog');if(!d.open)d.showModal();syncBack()}
function closeDialog(name){$(name+'-dialog').close();syncBack()}
function closeTop(){const open=[...document.querySelectorAll('dialog[open]')];if(open.length)open.at(-1).close();syncBack()}
function showPlayer(){
  if(!selected()){toast('Сначала выбери запись');return}
  renderCurrent();showDialog('player');ensureKaraokeText();haptic();
}
function showKaraoke(){
  if(!selected()){toast('Сначала выбери запись');return}
  state.follow=true;$('karaoke-follow').hidden=true;renderKaraoke();showDialog('karaoke');highlightLyrics(true);haptic();
  ensureKaraokeText();
}
function lyricCacheKey(t){return 'original-lyrics-v2:'+t.id+':'+(t.lyrics_version||'1')}
function ensureKaraokeText(){
  const t=selected();if(!t||state.lyricStatus==='loading')return;
  if(state.lyric){state.lyricStatus='ready';renderLyrics();return}
  if(!t.lyrics_ready||!t.lyrics_url){state.lyricStatus='unavailable';renderLyrics();return}
  loadPreparedLyrics(t);
}
async function loadPreparedLyrics(t){
  lyricController?.abort();const controller=new AbortController();lyricController=controller;
  const timeout=setTimeout(()=>controller.abort(),45000);
  const request=++state.lyricRequest;let stage='manifest';state.lyricStatus='loading';renderLyrics();delete $('karaoke-lines').dataset.loadError;
  try{
    const ar=await fetch(t.lyrics_url,{cache:'no-cache',signal:controller.signal});if(!ar.ok)throw Error('manifest');const data=await ar.json();
    if(data.track_id!==t.id||data.audio_sha256!==t.audio_sha256)throw Error('recording mismatch');
    if(data.status!=='ready')throw Error('unavailable');
    const lines=transcriptLines(data,t.duration_seconds||Infinity);if(!lines.length)throw Error('unavailable');
    if(request!==state.lyricRequest||state.current!==t.id)return;
    if(data.origin!=='original_lyrics'||!data.verification?.source_text_checked)throw Error('unavailable');
    state.lyric={lines,offset:0,source:'Текст песни · тайминги этого кавера',sourceUrl:data.source_url,song:data.song,artist:data.artist,timing:'cover-lines'};
    write(lyricCacheKey(t),state.lyric);state.lyricStatus='ready';renderLyrics();
  }catch(error){
    if(request!==state.lyricRequest||state.current!==t.id)return;
    $('karaoke-lines').dataset.loadError=stage+':'+error.name;
    state.lyricStatus=error.message==='unavailable'?'unavailable':'error';renderLyrics();
  }finally{clearTimeout(timeout);if(lyricController===controller)lyricController=null}
}
function renderCurrent(){
  const t=selected();if(!t)return;
  $('mini-player').hidden=false;$('mini-art').innerHTML=art(t,'eager');$('large-art').innerHTML=art(t,'eager');
  $('mini-title').textContent=title(t);$('mini-subtitle').textContent=sub(t);$('now-title').textContent=title(t);$('now-subtitle').textContent=sub(t);
  $('karaoke-art').innerHTML=art(t,'eager');$('karaoke-track-title').textContent=title(t);
  $('karaoke-track').setAttribute('aria-label',`Открыть плеер: ${title(t)}`);
  for(const id of ['mini-favorite','now-favorite']){$(id).setAttribute('aria-pressed',String(state.favorites.has(t.id)));$(id).setAttribute('aria-label',state.favorites.has(t.id)?'Удалить из избранного':'Добавить в избранное')}
  renderPlayState();updateTime();
}
function renderPlayState(){
  for(const id of ['mini-play','play','karaoke-play']){$(id).innerHTML=icon(audio.paused?'play':'pause');$(id).setAttribute('aria-label',audio.paused?'Воспроизвести':'Пауза')}
  $('shuffle').setAttribute('aria-pressed',String(state.shuffle));$('repeat').setAttribute('aria-pressed',String(state.repeat!=='off'));
  $('repeat').setAttribute('aria-label',{off:'Повтор выключен',all:'Повторять очередь',one:'Повторять одну запись'}[state.repeat]);$('repeat-one').hidden=state.repeat!=='one';
  document.querySelectorAll('.track').forEach(row=>{
    const current=Number(row.dataset.track)===state.current;row.classList.toggle('active',current);
    const num=row.querySelector('.track-number');if(current&&num)num.innerHTML=audio.paused?icon('play'):'<span class="equalizer"><i></i><i></i><i></i></span>';
  });
  if('mediaSession'in navigator)navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
}
async function playTrack(id,{queue,autoplay=true,restoreTime=0}={}){
  const t=state.byId.get(Number(id));if(!t?.audio_url){toast('Этот файл пока недоступен');return}
  if(queue){state.queue=queue.filter(id=>state.byId.get(id)?.audio_url);if(state.shuffle)state.queue=shuffleQueue(state.queue,t.id)}
  if(!state.queue.includes(t.id))state.queue.push(t.id);
  if(state.current!==t.id){
    lyricController?.abort();++state.lyricRequest;state.current=t.id;state.lyric=read(lyricCacheKey(t),null);state.lyricStatus=state.lyric?'ready':'idle';state.follow=true;
    audio.src=t.audio_url;seekRestore=restoreTime||null;$('play-error').textContent='';renderLyrics();
    const url=new URL(location.href);url.searchParams.set('track',t.id);history.replaceState(null,'',url);
    if('mediaSession'in navigator && 'MediaMetadata'in window)navigator.mediaSession.metadata=new MediaMetadata({title:title(t),artist:'fiquet',album:'Личный архив',artwork:t.cover_url?[{src:new URL(t.cover_url,document.baseURI).href}]:[]});
    renderCatalog();
  }
  renderCurrent();persist();
  ensureKaraokeText();if($('karaoke-dialog').open)renderKaraoke();
  if(autoplay){const request=++playRequest;try{await audio.play();if(request!==playRequest)return;haptic()}catch(e){if(e.name!=='AbortError'){$('play-error').textContent='Нажми воспроизведение ещё раз. Если файл не загружается, проверь подключение.';toast('Не удалось запустить запись')}}}
}
function playFromList(id){
  if(Number(id)===state.current){togglePlay();return}
  const queue=filtered().filter(t=>t.audio_url).map(t=>t.id);
  if(!queue.includes(Number(id)))queue.unshift(Number(id));playTrack(Number(id),{queue});
}
async function togglePlay(){if(!selected())return;try{audio.paused?await audio.play():audio.pause()}catch{toast('Нажми воспроизведение ещё раз')}}
function advance(direction=1,ended=false){
  if(direction<0&&audio.currentTime>3){audio.currentTime=0;return}
  const id=nextId(state.queue,state.current,{direction,repeat:state.repeat,ended});
  if(id==null){audio.pause();if(ended)toast('Подборка закончилась');return}
  if(id===state.current){audio.currentTime=0;audio.play().catch(()=>{})}else playTrack(id);
}
function updateTime(){
  const total=Number.isFinite(audio.duration)?audio.duration:selected()?.duration_seconds||0,current=audio.currentTime||0;
  $('elapsed').textContent=formatTime(current);$('total-time').textContent=formatTime(total);
  if(!seeking)$('seek').value=total?Math.round(current/total*1000):0;
  $('seek').disabled=!total;$('seek').setAttribute('aria-valuetext',`${formatTime(current)} из ${formatTime(total)}`);$('mini-progress-fill').style.width=`${total?current/total*100:0}%`;
  $('karaoke-elapsed').textContent=formatTime(current);$('karaoke-total').textContent=formatTime(total);$('karaoke-seek').disabled=!total;
  if(!seeking)$('karaoke-seek').value=total?Math.round(current/total*1000):0;
  $('karaoke-seek').setAttribute('aria-valuetext',`${formatTime(current)} из ${formatTime(total)}`);
  if('mediaSession'in navigator&&navigator.mediaSession.setPositionState&&total>0){try{navigator.mediaSession.setPositionState({duration:total,position:Math.min(current,total),playbackRate:1})}catch{}}
  highlightLyrics();if(Date.now()-saveTime>5000){saveTime=Date.now();persist()}
}
function showMenu(id){
  const t=state.byId.get(Number(id));if(!t)return;state.menuTrack=t.id;$('menu-title').textContent=title(t);
  $('menu-actions').innerHTML=`<button class="menu-action" data-menu-action="favorite">${icon('heart')}${state.favorites.has(t.id)?'Убрать из избранного':'Добавить в избранное'}</button>${t.audio_url?`<a class="menu-action" href="${esc(t.audio_url)}${config.mode==='local'?'?download=1':''}" download="fiquet-${t.id}.mp3">${icon('download')}Скачать MP3</a>`:''}<button class="menu-action" data-menu-action="share">${icon('share')}Поделиться записью</button><a class="menu-action" href="${esc(safeSource(t.source_url))}" target="_blank" rel="noopener noreferrer">${icon('link')}Открыть публикацию</a>${t.cover_source_url?`<a class="menu-action" href="${esc(safeSource(t.cover_source_url))}" target="_blank" rel="noopener noreferrer">${icon('link')}Источник фотографии</a>`:''}<p class="menu-description">${esc(t.caption||t.classification_reason||'Запись из открытой публикации fiquet.')}${t.status!=='ready'?'\n\n'+esc(t.error||'Файл недоступен'):''}</p>`;
  if(t.id===state.current&&/^https:\/\//.test(state.lyric?.sourceUrl||''))$('menu-actions').querySelector('.menu-description').insertAdjacentHTML('beforebegin',`<a class="menu-action" href="${esc(state.lyric.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('link')}Источник текста</a>`);
  showDialog('menu');
}
async function share(id){
  const t=state.byId.get(id);if(!t)return;const url=new URL(location.href);url.search='';url.searchParams.set('track',id);
  try{if(navigator.share)await navigator.share({title:`fiquet — ${title(t)}`,url:url.href});else{await navigator.clipboard.writeText(url.href);toast('Ссылка скопирована')}}catch(e){if(e.name!=='AbortError')toast('Ссылка: '+url.href)}
}

function lyricUnavailable(){
  return state.lyricStatus==='loading'?['Загружаем текст…','Текст и тайминги уже сохранены на сайте.']:state.lyricStatus==='error'?['Текст временно недоступен','Не удалось загрузить подготовленный текст. Повторим при следующем открытии.']:['Точный текст пока не найден','Для этой записи ещё не удалось подтвердить слова песни и их тайминги.'];
}
function renderLyrics(){renderKaraoke();highlightLyrics(true)}
function lyricMarkup(lines){return lines.map((line,i)=>`<button class="lyric-line" data-lyric-line="${i}" aria-label="Перейти к ${formatTime(line.time)}">${esc(line.text)||'♪'}</button>`).join('')}
function renderKaraoke(){
  delete $('karaoke-lines').dataset.activeLyricIndex;
  const lyric=state.lyric,lines=lyric?.lines||[];
  $('karaoke-title').textContent=title(selected());
  if(lines.length)$('karaoke-lines').innerHTML=lyricMarkup(lines);
  else{const [heading,description]=lyricUnavailable();$('karaoke-lines').innerHTML=`<div class="lyrics-empty"><h3>${heading}</h3><p>${description}</p></div>`}
  $('karaoke-mode').textContent='Текст песни';
  updateTime();
}
function highlightLyrics(force=false){
  if(!state.lyric?.lines?.length||!$('karaoke-dialog').open)return;
  const root=$('karaoke-lines'),index=activeLyric(state.lyric.lines,audio.currentTime,state.lyric.offset||0),displayIndex=Math.max(0,index);
  const changed=root.dataset.activeLyricIndex!==String(index),line=root.querySelector(`[data-lyric-line="${displayIndex}"]`);
  if(changed||force){
    root.dataset.activeLyricIndex=String(index);
    root.querySelectorAll('.lyric-line').forEach(el=>{const i=Number(el.dataset.lyricLine);el.classList.toggle('active',i===index);el.classList.toggle('past',i<index);el.setAttribute('aria-current',i===index?'true':'false')});
    if(line&&state.follow){
      root.style.setProperty('--lyrics-spacer',`${root.clientHeight/2}px`);
      const target=line.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop+line.offsetHeight/2-root.clientHeight/2;
      root.scrollTo({top:Math.max(0,target),behavior:force?'instant':'smooth'});
    }
  }
}
function setupTelegram(){
  document.documentElement.dataset.telegram=String(inTelegram);
  let ownedThemeKeys=[];
  const apply=()=>{const preference=read('theme','system');document.documentElement.dataset.theme=(inTelegram?tg.colorScheme:preference==='system'?(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark'):preference)==='light'?'light':'dark';
    const css=document.documentElement.style;
    for(const key of ownedThemeKeys)css.removeProperty(key);const mapped=telegramThemeVars(inTelegram?tg.themeParams:{});ownedThemeKeys=Object.keys(mapped);for(const [key,value]of Object.entries(mapped))css.setProperty(key,value);
    for(const [prefix,obj] of [['safe',tg?.safeAreaInset],['content',tg?.contentSafeAreaInset]])for(const side of ['top','bottom','left','right'])css.setProperty(`--app-${prefix}-${side}`,`${Math.max(0,obj?.[side]||0)}px`);
    const color=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();document.querySelector('meta[name="theme-color"]').content=color;
    if(inTelegram)try{tg.setHeaderColor?.(tg.themeParams.header_bg_color||tg.themeParams.bg_color||color);tg.setBackgroundColor?.(tg.themeParams.bg_color||color);tg.setBottomBarColor?.(tg.themeParams.bottom_bar_bg_color||tg.themeParams.bg_color||color)}catch{}};
  $('browser-theme').hidden=inTelegram;
  const themeLabel=()=>{$('browser-theme').textContent='Тема: '+{system:'как на устройстве',light:'светлая',dark:'тёмная'}[read('theme','system')]};
  $('browser-theme').onclick=()=>{write('theme',{system:'light',light:'dark',dark:'system'}[read('theme','system')]||'system');apply();themeLabel()};
  apply();themeLabel();if(!inTelegram){matchMedia('(prefers-color-scheme:light)').addEventListener('change',apply);return}
  try{tg.ready();tg.expand();tg.BackButton.onClick(closeTop);for(const event of ['themeChanged','safeAreaChanged','contentSafeAreaChanged','viewportChanged'])tg.onEvent(event,apply)}catch{}
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-nav],[data-scope],[data-play],[data-favorite],[data-menu],[data-close],[data-action],[data-menu-action],[data-lyric-line]');if(!b||b.disabled)return;
  if(b.dataset.nav)setView(b.dataset.nav);
  else if(b.dataset.scope)setScope(b.dataset.scope);
  else if(b.dataset.play)playFromList(Number(b.dataset.play));
  else if(b.dataset.favorite)toggleFavorite(Number(b.dataset.favorite));
  else if(b.dataset.menu)showMenu(Number(b.dataset.menu));
  else if(b.dataset.close)closeDialog(b.dataset.close);
  else if(b.dataset.action==='about')showDialog('about');
  else if(b.dataset.menuAction){const id=state.menuTrack;if(b.dataset.menuAction==='favorite'){toggleFavorite(id);closeDialog('menu')}if(b.dataset.menuAction==='share')share(id)}
  else if(b.dataset.lyricLine!=null&&state.lyric){const target=Math.min(audio.duration||Infinity,Math.max(0,state.lyric.lines[Number(b.dataset.lyricLine)].time-(state.lyric.offset||0)));seekRestore=audio.readyState?null:target;audio.currentTime=target;state.follow=true;$('karaoke-follow').hidden=true;updateTime();highlightLyrics(true)}
});
$('search').addEventListener('input',()=>{state.query=$('search').value;state.visible=60;$('clear-search').hidden=!state.query;renderCatalog()});
$('clear-search').onclick=()=>{$('search').value='';state.query='';$('clear-search').hidden=true;renderCatalog();$('search').focus()};
$('load-more').onclick=()=>{state.visible+=60;renderCatalog()};
$('see-full').onclick=()=>{setScope('full');$('list-title').scrollIntoView({behavior:'smooth',block:'start'})};
$('play-full').onclick=()=>{const queue=state.tracks.filter(t=>t.full_length&&t.audio_url).map(t=>t.id);if(queue[0])playTrack(queue[0],{queue})};
$('hero-shuffle').onclick=()=>{state.shuffle=true;const queue=shuffleQueue(state.tracks.filter(t=>['cover','music'].includes(t.classification)&&t.audio_url).map(t=>t.id));if(queue[0])playTrack(queue[0],{queue})};
$('expand-player').onclick=()=>showPlayer();$('mini-play').onclick=togglePlay;$('play').onclick=togglePlay;$('karaoke-play').onclick=togglePlay;
for(const id of ['mini-favorite','now-favorite'])$(id).onclick=()=>state.current&&toggleFavorite(state.current);
$('mini-next').onclick=()=>advance();$('next').onclick=()=>advance();$('previous').onclick=()=>advance(-1);
$('shuffle').onclick=()=>{state.shuffle=!state.shuffle;if(state.shuffle)state.queue=shuffleQueue(state.queue,state.current);renderPlayState();persist();haptic()};
$('repeat').onclick=()=>{state.repeat={off:'all',all:'one',one:'off'}[state.repeat];renderPlayState();persist();haptic()};
for(const id of ['seek','karaoke-seek']){
  $(id).addEventListener('input',()=>{const total=Number.isFinite(audio.duration)?audio.duration:0;if(total)audio.currentTime=Number($(id).value)/1000*total;updateTime()});
  $(id).addEventListener('pointerdown',()=>{seeking=true});$(id).addEventListener('blur',()=>{seeking=false});
}
window.addEventListener('resize',()=>highlightLyrics(true));
window.addEventListener('pointerup',()=>{seeking=false;updateTime()});
$('open-lyrics').onclick=showKaraoke;
$('karaoke-next').onclick=()=>advance();$('karaoke-previous').onclick=()=>advance(-1);
$('karaoke-track').onclick=()=>{closeDialog('karaoke');showPlayer();$('player-dialog').scrollTo({top:0,behavior:'instant'})};
$('karaoke-menu').onclick=()=>state.current&&showMenu(state.current);
$('karaoke-follow').onclick=()=>{state.follow=true;$('karaoke-follow').hidden=true;highlightLyrics(true)};
for(const event of ['wheel','touchstart'])$('karaoke-lines').addEventListener(event,()=>{state.follow=false;$('karaoke-follow').hidden=!state.lyric?.lines?.length},{passive:true});
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();syncBack()});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){dialog.close();syncBack()}})}
audio.addEventListener('play',renderPlayState);audio.addEventListener('pause',()=>{renderPlayState();persist()});audio.addEventListener('timeupdate',updateTime);audio.addEventListener('ended',()=>advance(1,true));
audio.addEventListener('loadedmetadata',()=>{if(seekRestore){audio.currentTime=Math.max(0,Math.min(seekRestore,audio.duration||0));seekRestore=null}updateTime()});
audio.addEventListener('error',()=>{$('play-error').textContent='Запись не загрузилась. Проверь интернет или выбери другую.';toast('Не удалось загрузить аудио');renderPlayState()});
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Space'&&e.target===document.body){e.preventDefault();togglePlay()}if(e.altKey&&e.key==='ArrowRight')advance();if(e.altKey&&e.key==='ArrowLeft')advance(-1)});
document.addEventListener('visibilitychange',persist);window.addEventListener('pagehide',persist);
if('mediaSession'in navigator)for(const [action,fn]of Object.entries({play:()=>audio.play().catch(()=>{}),pause:()=>audio.pause(),nexttrack:()=>advance(),previoustrack:()=>advance(-1),seekto:e=>{if(Number.isFinite(e.seekTime))audio.currentTime=e.seekTime},seekforward:e=>{audio.currentTime=Math.min(audio.duration||0,audio.currentTime+(e.seekOffset||10))},seekbackward:e=>{audio.currentTime=Math.max(0,audio.currentTime-(e.seekOffset||10))}})){try{navigator.mediaSession.setActionHandler(action,fn)}catch{}}

async function init(){
  setupTelegram();
  try{
    const response=await fetch(config.catalog||'./api/catalog',{cache:'no-cache'});if(!response.ok)throw Error('Каталог не загрузился');const data=await response.json();
    state.tracks=data.tracks;state.byId=new Map(data.tracks.map(t=>[t.id,t]));state.stats=data.stats||{};
    for(const id of state.favorites)if(!state.byId.has(id))state.favorites.delete(id);
    const full=state.tracks.filter(t=>t.full_length&&t.status==='ready').length,music=state.tracks.filter(t=>['cover','music'].includes(t.classification)&&t.status==='ready').length,all=state.tracks.filter(t=>t.status==='ready').length;
    $('hero-meta').textContent=`${formatCount(full,['полный кавер','полных кавера','полных каверов'])} · ${formatCount(music,['запись','записи','записей'])}`;
    $('about-stats').innerHTML=`<div class="about-stat"><span>Полные каверы</span><strong>${full}</strong></div><div class="about-stat"><span>Музыка в плеере</span><strong>${all}</strong></div><div class="about-stat"><span>Готовые тексты</span><strong>${state.stats.karaoke||0}</strong></div><div class="about-stat"><span>Проверено аудиофайлов</span><strong>${state.stats.audited||all}</strong></div><div class="about-stat"><span>Речь и спорные записи исключены</span><strong>${state.stats.excluded||0}</strong></div><div class="about-stat"><span>Медиа без доступного файла</span><strong>${state.tracks.filter(t=>t.status==='unavailable').length}</strong></div>`;
    $('karaoke-count').textContent=state.stats.karaoke||0;renderFeatured();renderCatalog();
    const id=Number(params.get('track')||stored.id),t=state.byId.get(id);
    if(t?.audio_url){state.queue=Array.isArray(stored.queue)?stored.queue.filter(id=>state.byId.get(id)?.audio_url):[];state.shuffle=Boolean(stored.shuffle);state.repeat=['off','all','one'].includes(stored.repeat)?stored.repeat:'off';if(!state.queue.length)state.queue=state.tracks.filter(t=>t.full_length&&t.audio_url).map(t=>t.id);await playTrack(id,{autoplay:false,restoreTime:id===stored.id?Number(stored.time)||0:0})}
    if(config.mode==='static'&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }catch(e){$('hero-meta').textContent='Библиотека временно недоступна';$('track-list').innerHTML=`<div class="empty-state"><h3>Не удалось открыть библиотеку</h3><p>Проверь подключение и обнови страницу.</p></div>`;toast(e.message)}
}
init();
