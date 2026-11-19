import { Room, RoomEvent } from 'https://esm.sh/livekit-client@2.15.6';
/* Goobert VoIP - browser client. Supabase anon key is public by design; database RLS is essential. */
const SUPABASE_URL='https://bdbzpwsdjuoigpxntlim.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_VqRbHogpVXM8DEwPb9xQvQ_y5bME2ZW';
const $=id=>document.getElementById(id);let sb=null,user=null,profile=null,activeCall=null,pc=null,localStream=null,callSub=null,iceSub=null,callWatch=null,incomingWatch=null,authMode='signup',seenIncoming=new Set(),pendingCandidates=[],seenRemoteIce=new Set(),answerApplied=false;
let ringtoneContext=null,ringtoneTimer=null,ringtoneChoice='classic',directMuted=false,currentDmUser=null,dmSubscription=null,liveKitRoom=null,directRoomConnecting=false,voiceRoom=null,voiceRoomChannel=null,voiceRoomStream=null,voicePeers=new Map(),voicePendingCandidates=new Map(),voiceMuted=false,activeServer=null,activeTextChannel=null,chatSubscription=null,knownServers=[];
// Guard optional UI elements so a missing panel never crashes the whole app.
const show=id=>$(id)?.classList.remove('hidden'),hide=id=>$(id)?.classList.add('hidden');
function message(t){$('authMessage').textContent=t||''}
function setCall(t,sub){const panel=$('callPanel');if(!panel)return;const b=panel.querySelector('b'),small=panel.querySelector('small');if(b)b.textContent=t;if(small)small.textContent=sub||'';const status=$('stageStatus');if(status)status.textContent=t.toUpperCase()}
function initClient(url,key){sb=window.supabase.createClient(url,key);}
async function boot(){initClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);const {data:{session}}=await sb.auth.getSession();if(session){user=session.user;await enterApp()}else show('authView');sb.auth.onAuthStateChange(async(event,s)=>{
  if(event==='PASSWORD_RECOVERY'){setTimeout(()=>{show('authView');hide('appView');setRecoveryMode(true);message('Enter your new password below.')},0);return}
  if(s&&!user){user=s.user;setTimeout(enterApp,0)}else if(!s&&user){user=null;profile=null;show('authView');hide('appView')}
})}
$('switchAuth').onclick=()=>{authMode=authMode==='signup'?'login':'signup';$('authTitle').textContent=authMode==='signup'?'Create your account':'Welcome back';$('authSubtitle').textContent=authMode==='signup'?'Pick a username so friends can find and call you.':'Log in to your Goobert VoIP account.';$('authSubmit').textContent=authMode==='signup'?'Create account':'Log in';$('switchText').textContent=authMode==='signup'?'Already have an account?':'New to Goobert VoIP?';$('switchAuth').textContent=authMode==='signup'?'Log in':'Create account';$('usernameWrap').classList.toggle('hidden',authMode==='login');$('forgotPassword')?.classList.toggle('hidden',authMode!=='login');$('password').autocomplete=authMode==='signup'?'new-password':'current-password';message('')};
function makeUsername(email){let base=(email.split('@')[0]||'goobert').toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,14);if(base.length<3)base='goobert';return (base+'_'+Math.floor(1000+Math.random()*9000)).slice(0,20)}
$('togglePassword').onclick=()=>{const field=$('password');const showing=field.type==='text';field.type=showing?'password':'text';$('togglePassword').textContent=showing?'Show':'Hide'};
$('authForm').onsubmit=async e=>{e.preventDefault();const email=$('email').value.trim(),password=$('password').value;let username=$('username').value.trim().toLowerCase();try{if(authMode==='signup'){if(!username)username=makeUsername(email);if(!/^[a-z0-9_]{3,20}$/.test(username))throw Error('Username must be 3–20 characters using letters, numbers or underscores.');message('Creating your account…');const {data,error}=await sb.auth.signUp({email,password,options:{data:{username}}});if(error)throw error;if(data.session){user=data.user;await enterApp()}else message('Account created! Check your email to confirm. Your username is @'+username+'.')}else{message('Logging in…');const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;await enterApp()}}catch(err){message(err.message||'Could not complete account setup.')}};
async function enterApp(){if(!user)return;hide('setupView');hide('authView');show('appView');$('headerUser').textContent='Signed in';const {data,error}=await sb.from('profiles').select('id,username,display_name,avatar_emoji,bio,ringtone').eq('id',user.id).maybeSingle();if(error){setCall('Database setup needed',error.message+' — run social-upgrade.sql in Supabase.');return}profile=data;if(!profile){setCall('Profile not found','Check the SQL setup instructions in README.md.');return}applyMyProfile();listenForCalls();loadServers();loadFriends();}
$('logout').onclick=async()=>{await cleanupCall();await sb.auth.signOut();user=null;hide('appView');show('authView')};
$('searchBtn').onclick=searchUsers;$('focusSearch')?.addEventListener('click',()=>{$('userSearch').focus();$('userSearch').value='';loadFriends()});$('userSearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchUsers()});

function applyMyProfile(){if(!profile)return;const label=profile.display_name||profile.username;$('myName').textContent=label;$('myAvatar').textContent=profile.avatar_emoji||profile.username[0].toUpperCase();$('topAvatar').textContent=profile.avatar_emoji||profile.username[0].toUpperCase();$('headerUser').textContent='@'+profile.username;ringtoneChoice=profile.ringtone||'classic'}
function openProfileEditor(){if(!profile)return;$('profileDisplayName').value=profile.display_name||'';$('profileAvatar').value=profile.avatar_emoji||'🐸';$('profileBio').value=profile.bio||'';$('ringtoneChoice').value=profile.ringtone||'classic';$('profileSaveStatus').textContent='';show('profileEditor');$('profileEditor').scrollIntoView({behavior:'smooth',block:'center'})}
$('editProfileBtn').onclick=openProfileEditor;$('closeProfileEditor').onclick=()=>hide('profileEditor');
$('saveProfileBtn').onclick=async()=>{const display_name=$('profileDisplayName').value.trim().slice(0,32),avatar_emoji=$('profileAvatar').value.trim().slice(0,4)||'🐸',bio=$('profileBio').value.trim().slice(0,120),ringtone=$('ringtoneChoice').value;$('saveProfileBtn').disabled=true;try{const {data,error}=await sb.from('profiles').update({display_name,avatar_emoji,bio,ringtone}).eq('id',user.id).select('id,username,display_name,avatar_emoji,bio,ringtone').single();if(error)throw error;profile=data;applyMyProfile();$('profileSaveStatus').textContent='Profile saved!';hide('profileEditor')}catch(e){$('profileSaveStatus').textContent='Could not save: '+e.message+' (run social-upgrade.sql first).'}finally{$('saveProfileBtn').disabled=false}};
async function openDirectMessages(person){currentDmUser=person;$('dmTitle').textContent=person.display_name||'@'+person.username;$('dmSubtitle').textContent='Private messages · @'+person.username;show('directMessagePanel');$('dmMessages').innerHTML='<div class="dm-empty">Loading messages…</div>';$('directMessagePanel').scrollIntoView({behavior:'smooth',block:'nearest'});if(dmSubscription){await sb.removeChannel(dmSubscription);dmSubscription=null}await loadDirectMessages();dmSubscription=sb.channel('dm-'+[user.id,person.id].sort().join('-')).on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},payload=>{const row=payload.new;if((row.sender_id===user.id&&row.receiver_id===person.id)||(row.sender_id===person.id&&row.receiver_id===user.id))appendDirectMessage(row)}).subscribe();$('dmInput').focus()}
async function loadDirectMessages(){if(!currentDmUser)return;const {data,error}=await sb.from('direct_messages').select('id,sender_id,receiver_id,content,created_at').or(`and(sender_id.eq.${user.id},receiver_id.eq.${currentDmUser.id}),and(sender_id.eq.${currentDmUser.id},receiver_id.eq.${user.id})`).order('created_at',{ascending:true}).limit(100);if(error){$('dmMessages').textContent=error.message+' — run social-upgrade.sql in Supabase.';return}$('dmMessages').innerHTML='';if(!data?.length){$('dmMessages').innerHTML='<div class="dm-empty">Say hello! Your messages will appear here.</div>';return}data.forEach(appendDirectMessage)}
function appendDirectMessage(row){const box=$('dmMessages');if(!box||box.querySelector('[data-dm-id="'+row.id+'"]'))return;const empty=box.querySelector('.dm-empty');if(empty)empty.remove();const item=document.createElement('div');item.className='dm-bubble '+(row.sender_id===user.id?'mine':'theirs');item.dataset.dmId=row.id;const body=document.createElement('p');body.textContent=row.content;const time=document.createElement('small');time.textContent=new Date(row.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});item.append(body,time);box.append(item);box.scrollTop=box.scrollHeight}
$('dmForm').onsubmit=async e=>{e.preventDefault();const content=$('dmInput').value.trim();if(!content||!currentDmUser)return;const send=$('dmForm').querySelector('button');send.disabled=true;try{const {data,error}=await sb.from('direct_messages').insert({sender_id:user.id,receiver_id:currentDmUser.id,content}).select().single();if(error)throw error;$('dmInput').value='';appendDirectMessage(data)}catch(err){$('dmMessages').textContent='Could not send: '+err.message+' — run social-upgrade.sql in Supabase.'}finally{send.disabled=false;$('dmInput').focus()}};
$('closeDm').onclick=()=>hide('directMessagePanel');


async function loadFriends(){
  if(!user||!sb)return;
  const box=$('searchResults');box.innerHTML='<div class="empty-state">Loading your friends…</div>';
  const {data:links,error}=await sb.from('friends').select('friend_id,created_at').eq('user_id',user.id).order('created_at',{ascending:false});
  if(error){box.innerHTML='<div class="empty-state">Could not load friends. Run friends-upgrade.sql in Supabase.</div>';return}
  if(!links?.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">⌕</div><b>No friends yet</b><p>Search for a username above, then press Add Friend. Your friends will stay here after refresh.</p></div>';return}
  const ids=links.map(x=>x.friend_id);
  const {data:people,error:peopleError}=await sb.from('profiles').select('id,username,display_name,avatar_emoji,bio').in('id',ids);
  if(peopleError){box.textContent=peopleError.message;return}
  const ordered=ids.map(id=>people.find(p=>p.id===id)).filter(Boolean);
  box.replaceChildren(...ordered.map(p=>renderFriendCard(p,true)));
}
function renderFriendCard(p,isFriend){
  const el=document.createElement('div');el.className='person';el.dataset.userId=p.id;
  const left=document.createElement('div');left.className='person-left';
  const av=document.createElement('div');av.className='avatar';av.textContent=p.avatar_emoji||p.username[0].toUpperCase();
  const txt=document.createElement('div');const b=document.createElement('b');
  const clean=(p.display_name||'').trim().replace(/^@+/,'');b.textContent=(!clean||clean.toLowerCase()===p.username.toLowerCase())?p.username:clean;
  const sm=document.createElement('small');sm.textContent='@'+p.username+(p.bio?' · '+p.bio:'');txt.append(b,sm);left.append(av,txt);
  const actions=document.createElement('div');actions.className='person-actions';
  const msg=document.createElement('button');msg.type='button';msg.className='ghost';msg.textContent='Message';msg.onclick=()=>openDirectMessages(p);
  const call=document.createElement('button');call.type='button';call.className='primary';call.textContent='Call';call.onclick=()=>startCall(p);
  actions.append(msg,call);
  if(isFriend){
    const remove=document.createElement('button');remove.type='button';remove.className='ghost remove-friend';remove.textContent='Remove';remove.onclick=()=>removeFriend(p,remove);actions.append(remove);
  }else{
    const add=document.createElement('button');add.type='button';add.className='primary add-friend-btn';add.textContent='Add Friend';add.onclick=()=>addFriend(p,add);actions.append(add);
  }
  el.append(left,actions);return el;
}
async function addFriend(person,button){
  button.disabled=true;button.textContent='Adding…';
  const {error}=await sb.from('friends').insert({user_id:user.id,friend_id:person.id});
  if(error&&error.code!=='23505'){button.disabled=false;button.textContent='Add Friend';communityNotice('Could not add friend: '+error.message);return}
  communityNotice('Friend added! They will stay in your list after refresh.');
  await loadFriends();
}
async function removeFriend(person,button){
  if(!confirm('Remove @'+person.username+' from your friends?'))return;
  button.disabled=true;button.textContent='Removing…';
  const {error}=await sb.from('friends').delete().eq('user_id',user.id).eq('friend_id',person.id);
  if(error){button.disabled=false;button.textContent='Remove';communityNotice('Could not remove friend: '+error.message);return}
  await loadFriends();
}

async function searchUsers(){
  const q=$('userSearch').value.trim().toLowerCase();
  if(q.length<2){await loadFriends();return}
  const {data,error}=await sb.from('profiles').select('id,username,display_name,avatar_emoji,bio').ilike('username',`%${q}%`).neq('id',user.id).limit(15);
  if(error){$('searchResults').textContent=error.message;return}
  if(!data?.length){$('searchResults').innerHTML='<div class="empty-state">No users found. Make sure they have created an account.</div>';return}
  const {data:links}=await sb.from('friends').select('friend_id').eq('user_id',user.id);
  const friendIds=new Set((links||[]).map(x=>x.friend_id));
  $('searchResults').replaceChildren(...data.map(p=>renderFriendCard(p,friendIds.has(p.id))));
}
async function getMedia(){if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access needs HTTPS and a supported browser. Open your deployed Vercel HTTPS link.');return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})}
async function addRemoteCandidate(candidate){
  if(!pc||!candidate)return;
  const key=JSON.stringify(candidate);if(seenRemoteIce.has(key))return;
  if(!pc.remoteDescription){if(!pendingCandidates.some(c=>JSON.stringify(c)===key))pendingCandidates.push(candidate);return}
  try{await pc.addIceCandidate(new RTCIceCandidate(candidate));seenRemoteIce.add(key)}catch(e){console.warn('ICE candidate:',e)}
}
async function flushCandidates(){const queued=pendingCandidates.splice(0);for(const c of queued)await addRemoteCandidate(c)}
// Re-read candidates after installing the remote description to close the realtime-subscription timing gap.
async function loadStoredCandidates(callId){if(!pc)return;const {data,error}=await sb.from('ice_candidates').select('candidate,sender_id').eq('call_id',callId).neq('sender_id',user.id);if(error){console.warn('Could not load earlier ICE candidates:',error.message);return}for(const row of (data||[]))await addRemoteCandidate(row.candidate)}
function getIceServers(){
  const servers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
  // Prefer Metered's complete ICE server list, including TURN over UDP/TCP/TLS.
  try{const saved=JSON.parse(localStorage.getItem('goobert_ice_servers')||'null');if(Array.isArray(saved)&&saved.length)return saved;}catch(e){console.warn('Saved ICE servers could not be read:',e)}
  // Backward compatibility with manually entered TURN credentials.
  try{const turn=JSON.parse(localStorage.getItem('goobert_turn')||'null');if(turn?.urls&&turn?.username&&turn?.credential)servers.push({urls:turn.urls.split(',').map(x=>x.trim()),username:turn.username,credential:turn.credential})}catch(e){}
  return servers;
}
async function getLiveKitToken(roomName){
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)throw new Error('Please log in again.');
  const response=await fetch('/api/livekit-token',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({roomName})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||'Could not get voice connection token.');
  if(!payload.serverUrl||!payload.token)throw new Error('LiveKit token response was incomplete.');
  return payload;
}

let cameraEnabled=false,videoFilter='none',localCameraElement=null;
function ensureVideoStage(){
  let stage=$('callVideoStage');
  if(!stage){
    stage=document.createElement('div');stage.id='callVideoStage';stage.className='call-video-stage';
    const panel=$('callPanel');panel?.after(stage);
  }
  return stage;
}
function applyVideoFilter(){
  document.querySelectorAll('.call-video').forEach(v=>{v.style.filter=videoFilter==='none'?'none':videoFilter});
}
function updateCameraButton(){
  const b=$('directCameraBtn');if(!b)return;
  b.textContent=cameraEnabled?'📷 Turn camera off':'📷 Turn camera on';
  b.classList.toggle('camera-on',cameraEnabled);
}
async function toggleCallCamera(){
  if(!liveKitRoom){setCall('Camera unavailable','Start or answer a call before turning on your camera.');return}
  const btn=$('directCameraBtn');if(btn)btn.disabled=true;
  try{
    cameraEnabled=!cameraEnabled;
    await liveKitRoom.localParticipant.setCameraEnabled(cameraEnabled);
    if(cameraEnabled){
      const pub=liveKitRoom.localParticipant.getTrackPublication('camera');
      if(pub?.track){
        const stage=ensureVideoStage();
        if(localCameraElement)localCameraElement.remove();
        localCameraElement=pub.track.attach();
        localCameraElement.className='call-video local-video';
        localCameraElement.autoplay=true;localCameraElement.playsInline=true;localCameraElement.muted=true;
        stage.prepend(localCameraElement);applyVideoFilter();
      }
    }else{
      if(localCameraElement){localCameraElement.remove();localCameraElement=null}
    }
    updateCameraButton();
  }catch(e){
    cameraEnabled=!cameraEnabled;updateCameraButton();
    setCall('Could not change camera',e.message);
  }finally{if(btn)btn.disabled=false}
}
function setCallVideoFilter(value){
  const filters={none:'none',mono:'grayscale(1)',warm:'sepia(.45) saturate(1.25)',cool:'hue-rotate(175deg) saturate(1.2)',vivid:'saturate(1.7) contrast(1.08)',soft:'brightness(1.08) saturate(.82)'};
  videoFilter=filters[value]||'none';applyVideoFilter();
}

async function connectLiveKitRoom(roomName, purpose){
  if(liveKitRoom)await disconnectLiveKitRoom();
  const {serverUrl,token}=await getLiveKitToken(roomName);
  const room=new Room({adaptiveStream:true,dynacast:true});
  room.on(RoomEvent.TrackSubscribed,(track,publication,participant)=>{
    if(track.kind==='audio'){
      const element=track.attach();element.id='lk-audio-'+participant.identity;
      element.autoplay=true;element.playsInline=true;document.body.append(element);
      element.play().catch(()=>communityNotice('Tap the page once if your browser blocks audio playback.'));
    }
    if(track.kind==='video'&&purpose==='direct'){
      const element=track.attach();element.className='call-video remote-video';element.autoplay=true;element.playsInline=true;element.dataset.participant=participant.identity;
      ensureVideoStage();$('callVideoStage').append(element);applyVideoFilter();
    }
    if(purpose==='community')renderLiveKitParticipants(room);
  });
  room.on(RoomEvent.TrackUnsubscribed,(track)=>track.detach().forEach(el=>el.remove()));
  room.on(RoomEvent.ParticipantConnected,()=>{if(purpose==='community')renderLiveKitParticipants(room)});
  room.on(RoomEvent.ParticipantDisconnected,()=>{if(purpose==='community')renderLiveKitParticipants(room)});
  room.on(RoomEvent.Disconnected,()=>{if(liveKitRoom===room){liveKitRoom=null;if(purpose==='community'&&voiceRoom){$('voiceRoomStatus').textContent='Disconnected';}}});
  await room.connect(serverUrl,token);
  await room.localParticipant.setMicrophoneEnabled(true);
  liveKitRoom=room;directMuted=false;const mb=$('directMuteBtn');if(mb){mb.textContent='🎙 Mute microphone';mb.setAttribute('aria-pressed','false');mb.classList.remove('is-muted')}
  return room;
}
async function disconnectLiveKitRoom(){
  const room=liveKitRoom;liveKitRoom=null;
  if(room){try{await room.disconnect()}catch(e){console.warn('LiveKit disconnect:',e)}}
  document.querySelectorAll('[id^="lk-audio-"]').forEach(el=>el.remove());
}
async function startCall(target){
  try{
    document.body.classList.add('is-calling');setCall('Calling…','Waiting for @'+(target.display_name||target.username)+' to answer.');
    const {data:call,error}=await sb.from('calls').insert({caller_id:user.id,callee_id:target.id,status:'ringing'}).select().single();
    if(error)throw error;
    activeCall=call;setCall('Calling '+(target.display_name||'@'+target.username),'Waiting for them to answer…');watchCall(call.id);showIncomingControls(true);
  }catch(e){setCall('Could not start call',e.message);await cleanupCall()}
}
function listenForCalls(){if(incomingWatch)clearInterval(incomingWatch);incomingWatch=setInterval(checkIncoming,2500);checkIncoming()}

// Incoming-call ringtone and browser notifications.
function stopIncomingRingtone(){
  if(ringtoneTimer){clearInterval(ringtoneTimer);ringtoneTimer=null;}
  if(ringtoneContext){
    try{ringtoneContext.close();}catch(e){}
    ringtoneContext=null;
  }
}
function playRingtoneTone(){if(!ringtoneContext||ringtoneContext.state==='closed')return;const patterns={classic:[[880,.22],[660,.22],[880,.22]],bubbles:[[660,.12],[990,.12],[1320,.18]],synth:[[440,.15],[554,.15],[659,.25]],soft:[[784,.18],[988,.28]]};const pattern=patterns[ringtoneChoice]||patterns.classic;let offset=0;for(const [frequency,duration] of pattern){try{const osc=ringtoneContext.createOscillator(),gain=ringtoneContext.createGain();osc.type=ringtoneChoice==='synth'?'triangle':'sine';osc.frequency.value=frequency;const t=ringtoneContext.currentTime+offset;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.10,t+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(ringtoneContext.destination);osc.start(t);osc.stop(t+duration+.02)}catch(e){}offset+=duration+.055}}
function startIncomingRingtone(){
  stopIncomingRingtone();
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  try{
    ringtoneContext=new AudioContextClass();
    ringtoneContext.resume().catch(()=>{});
    playRingtoneTone();
    ringtoneTimer=setInterval(playRingtoneTone,1500);
  }catch(e){console.warn('Ringtone unavailable:',e);}
}
async function enableCallAlerts(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(AudioContextClass){
    try{
      const ctx=new AudioContextClass();
      await ctx.resume();
      const oscillator=ctx.createOscillator();
      const gain=ctx.createGain();
      gain.gain.value=0.0001;
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start();oscillator.stop(ctx.currentTime+0.03);
      await ctx.close();
    }catch(e){console.warn('Audio permission/unlock:',e);}
  }
  if('Notification' in window){
    try{
      if(Notification.permission==='default')await Notification.requestPermission();
    }catch(e){console.warn('Notification permission:',e);}
  }
  communityNotice('Call alerts enabled where your browser allows them. Keep Goobert open to receive calls.');
}
function notifyIncomingCall(caller,callId){
  startIncomingRingtone();
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  try{
    const notification=new Notification('Incoming Goobert call',{
      body:'@'+caller+' is calling you.',
      tag:'goobert-call-'+callId,
      icon:'goobert-mascot.png'
    });
    notification.onclick=()=>{window.focus();notification.close();};
  }catch(e){console.warn('Notification could not be shown:',e);}
}

async function checkIncoming(){if(!user||activeCall)return;const {data,error}=await sb.from('calls').select('*').eq('callee_id',user.id).eq('status','ringing').order('created_at',{ascending:false}).limit(1);if(error||!data?.length)return;const c=data[0];if(seenIncoming.has(c.id))return;seenIncoming.add(c.id);const {data:p}=await sb.from('profiles').select('username,display_name,avatar_emoji').eq('id',c.caller_id).maybeSingle();$('incomingPanel').innerHTML='';const title=document.createElement('b');title.textContent='Incoming call from '+(p?.display_name||'@'+(p?.username||'someone'));const line=document.createElement('div');line.textContent='They are calling your Goobert account.';const yes=document.createElement('button');yes.className='accept';yes.textContent='Accept';yes.type='button';yes.onclick=(event)=>{event.preventDefault();event.stopPropagation();acceptCall(c)};const no=document.createElement('button');no.className='reject';no.textContent='Decline';no.type='button';no.onclick=(event)=>{event.preventDefault();event.stopPropagation();declineCall(c,no)};$('incomingPanel').append(title,line,yes,no);show('incomingPanel');notifyIncomingCall(p?.display_name||p?.username||'someone',c.id);}
async function declineCall(c,button){
  if(button?.dataset.busy==='1')return;
  if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Declining…'}
  stopIncomingRingtone();
  try{
    const {error}=await sb.from('calls').update({status:'rejected'}).eq('id',c.id);
    if(error)throw error;
    hide('incomingPanel');seenIncoming.delete(c.id);
    setCall('Call declined','You can start another call now.');
  }catch(e){
    if(button){button.disabled=false;button.dataset.busy='0';button.textContent='Decline'}
    setCall('Could not decline call',e.message);
  }
}
async function acceptCall(c){
  try{
    stopIncomingRingtone();document.body.classList.add('is-calling');activeCall=c;
    const {error}=await sb.from('calls').update({status:'accepted'}).eq('id',c.id);
    if(error)throw error;
    hide('incomingPanel');setCall('Connecting…','Joining secure voice room.');watchCall(c.id);showIncomingControls(true);
    directRoomConnecting=true;
    await connectLiveKitRoom('goobert-call-'+c.id,'direct');
    setCall('Connected call','Talking with the other person.');
    directRoomConnecting=false;
  }catch(e){setCall('Could not answer',e.message);await cleanupCall(false);await declineCall(c)}
}
async function handleCallUpdate(c,id){
  if(!activeCall||activeCall.id!==id||!c)return;
  if(c.status==='accepted'&&!liveKitRoom&&!directRoomConnecting){
    directRoomConnecting=true;
    try{setCall('Connecting…','Joining secure voice room.');await connectLiveKitRoom('goobert-call-'+id,'direct');if(activeCall?.id===id)setCall('Connected call','Talking with the other person.');}
    catch(e){setCall('Connection failed',e.message+' Check the LiveKit setup in Vercel.');await cleanupCall(true)}
    finally{directRoomConnecting=false}
  }
  if(['ended','rejected'].includes(c.status)){
    setCall(c.status==='rejected'?'Call declined':'Call ended','You can start another call now.');
    await cleanupCall(false);
  }
}
function watchCall(id){
  if(callSub)sb.removeChannel(callSub);
  callSub=sb.channel('call-'+id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'calls',filter:'id=eq.'+id},payload=>handleCallUpdate(payload.new,id)).subscribe();
  if(callWatch)clearInterval(callWatch);
  callWatch=setInterval(async()=>{
    if(!activeCall||activeCall.id!==id)return;
    const {data,error}=await sb.from('calls').select('*').eq('id',id).maybeSingle();
    if(!error&&data)await handleCallUpdate(data,id);
  },1800);
}
async function cleanupCall(update=true){
  const old=activeCall;activeCall=null;directMuted=false;directRoomConnecting=false;cameraEnabled=false;localCameraElement=null;updateCameraButton();$('callVideoStage')?.querySelectorAll('video').forEach(v=>{try{v.srcObject=null}catch(e){}v.remove()});$('callVideoStage')?.remove();document.body.classList.remove('is-calling');stopIncomingRingtone();
  if(callWatch){clearInterval(callWatch);callWatch=null}
  if(update&&old){try{await sb.from('calls').update({status:'ended'}).eq('id',old.id)}catch(e){console.warn('Could not mark call ended',e)}}
  await disconnectLiveKitRoom();
  if(callSub){await sb.removeChannel(callSub);callSub=null}
  if(iceSub){await sb.removeChannel(iceSub);iceSub=null}
  hide('incomingPanel');showIncomingControls(false);
  const controls=$('callControls');if(controls)controls.classList.add('hidden');
}
function showIncomingControls(v){const el=$('callControls');if(el)el.classList.toggle('hidden',!v)}
const controls=document.createElement('div');controls.id='callControls';controls.className='call-controls hidden';const mute=document.createElement('button');mute.id='directMuteBtn';mute.type='button';mute.className='mute-call-btn';mute.textContent='🎙 Mute microphone';mute.setAttribute('aria-pressed','false');mute.onclick=async()=>{if(!liveKitRoom){setCall('Microphone not connected','Wait until the call connects, then try mute again.');return}try{directMuted=!directMuted;await liveKitRoom.localParticipant.setMicrophoneEnabled(!directMuted);mute.textContent=directMuted?'🔇 Unmute microphone':'🎙 Mute microphone';mute.setAttribute('aria-pressed',String(directMuted));mute.classList.toggle('is-muted',directMuted)}catch(e){directMuted=!directMuted;setCall('Could not change microphone',e.message)}};const hang=document.createElement('button');hang.id='directHangupBtn';hang.type='button';hang.className='hangup-call-btn';hang.textContent='☎ Hang up';hang.onclick=async()=>{if(!activeCall||hang.dataset.busy==='1')return;hang.dataset.busy='1';hang.disabled=true;hang.textContent='Ending call…';try{await cleanupCall(true);setCall('Call ended','You can start another call now.')}finally{hang.dataset.busy='0';hang.disabled=false;hang.textContent='☎ Hang up'}};const camera=document.createElement('button');camera.id='directCameraBtn';camera.type='button';camera.className='camera-call-btn';camera.textContent='📷 Turn camera on';camera.onclick=toggleCallCamera;
const filterWrap=document.createElement('label');filterWrap.className='video-filter-control';filterWrap.textContent='Filter ';
const filter=document.createElement('select');filter.id='callVideoFilter';filter.innerHTML='<option value="none">Original</option><option value="mono">Black & white</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="vivid">Vivid</option><option value="soft">Soft</option>';filter.onchange=()=>setCallVideoFilter(filter.value);filterWrap.append(filter);
controls.append(mute,camera,filterWrap,hang);$('callPanel').after(controls);


// Password recovery and safe self-service account deletion.
function setRecoveryMode(enabled){
  $('passwordRecoveryPanel')?.classList.toggle('hidden',!enabled);
  $('authForm')?.classList.toggle('hidden',enabled);
  $('switchAuth')?.classList.toggle('hidden',enabled);
  $('forgotPassword')?.classList.toggle('hidden',enabled);
  if(enabled){$('authTitle').textContent='Reset your password';$('authSubtitle').textContent='Choose a new password for your Goobert account.'}
}
$('forgotPassword')?.addEventListener('click',async()=>{
  const email=$('email').value.trim();if(!email){message('Enter your account email first.');$('email').focus();return}
  try{message('Sending reset email…');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});if(error)throw error;message('If that account exists, a password reset email has been sent. Check your inbox and spam folder.')}
  catch(e){message('Could not send reset email: '+e.message)}
});
$('saveNewPassword')?.addEventListener('click',async()=>{
  const password=$('newPassword').value;if(password.length<6){message('Use at least 6 characters.');return}
  try{const {error}=await sb.auth.updateUser({password});if(error)throw error;$('newPassword').value='';setRecoveryMode(false);message('Password updated successfully.')}
  catch(e){message('Password update failed: '+e.message)}
});
$('deleteAccount')?.addEventListener('click',async()=>{
  if(!confirm('Permanently delete your Goobert account and its call history?'))return;
  if(prompt('Type DELETE to confirm:')!=='DELETE')return;
  try{
    await cleanupCall(true);if(voiceRoom)await leaveVoiceRoom();
    const {error}=await sb.rpc('delete_own_goobert_account');if(error)throw error;
    user=null;profile=null;await sb.auth.signOut();hide('appView');show('authView');message('Your account was deleted.');
  }catch(e){alert('Could not delete account: '+e.message+' Run account-recovery.sql in Supabase SQL Editor first.')}
});

// ================= Goobert Communities =================
function communityNotice(text){const el=$('communityStatus');if(el)el.textContent=text||''}
function randomInvite(){return Math.random().toString(36).slice(2,9).toUpperCase()}
async function loadServers(){
  if(!user)return;
  const {data:members,error}=await sb.from('server_members').select('server_id').eq('user_id',user.id);
  if(error){communityNotice('Run communities.sql in Supabase to enable communities.');return}
  const ids=(members||[]).map(x=>x.server_id);
  const {data:servers,error:serverError}=ids.length?await sb.from('servers').select('id,name,invite_code,owner_id').in('id',ids).order('created_at'): {data:[],error:null};
  if(serverError){communityNotice(serverError.message);return}
  knownServers=servers||[];
  const list=$('serverList');list.replaceChildren();
  if(!knownServers.length){const small=document.createElement('small');small.textContent='No communities yet. Create one or join with an invite code.';list.append(small);hide('serverWorkspace');return}
  knownServers.forEach(s=>{const b=document.createElement('button');b.className='server-chip'+(activeServer?.id===s.id?' active':'');b.textContent=s.name;b.onclick=()=>openServer(s);list.append(b)});
  if(!activeServer||!knownServers.some(s=>s.id===activeServer.id))await openServer(knownServers[0]);
}
async function createServer(){
  const name=$('serverNameInput').value.trim();
  if(name.length<2){communityNotice('Community names need at least 2 characters.');return}
  const invite=randomInvite();
  const {data:id,error}=await sb.rpc('create_goobert_server',{server_name_input:name,invite_code_input:invite});
  if(error){communityNotice(error.message+' — run communities.sql in Supabase first.');return}
  const {data:s,error:fetchError}=await sb.from('servers').select('id,name,invite_code,owner_id').eq('id',id).single();
  if(fetchError){communityNotice(fetchError.message);return}
  $('serverNameInput').value='';activeServer=s;await loadServers();communityNotice('Community created! Invite code: '+invite);
}
async function joinServer(){
  const code=$('inviteCodeInput').value.trim().toUpperCase();
  if(!code){communityNotice('Enter an invite code.');return}
  const {data,error}=await sb.rpc('join_goobert_server',{invite_code_input:code});
  if(error){communityNotice(error.message+' — run communities.sql if you have not yet.');return}
  $('inviteCodeInput').value='';communityNotice('Joined community!');await loadServers();
}
async function openServer(server){
  if(voiceRoom)await leaveVoiceRoom();
  if(chatSubscription){await sb.removeChannel(chatSubscription);chatSubscription=null}
  activeServer=server;show('serverWorkspace');$('activeServerName').textContent=server.name;$('leaveServerBtn').textContent=server.owner_id===user.id?'Delete community':'Leave community';
  $('copyInviteBtn').dataset.code=server.invite_code;
  const {data:channels,error}=await sb.from('server_channels').select('*').eq('server_id',server.id).order('created_at');
  if(error){communityNotice(error.message);return}
  const list=$('channelList');list.replaceChildren();
  (channels||[]).forEach(ch=>{const b=document.createElement('button');b.className='channel-chip';b.textContent=(ch.type==='voice'?'🔊 ':'# ')+ch.name;b.onclick=()=>selectCommunityChannel(ch);list.append(b)});
  const firstText=(channels||[]).find(c=>c.type==='text');
  if(firstText)await selectCommunityChannel(firstText);
  else{$('chatMessages').replaceChildren();$('communityChat').classList.add('hidden')}
}
async function selectCommunityChannel(ch){
  activeTextChannel=ch;
  if(ch.type==='voice'){
    $('communityChat').classList.add('hidden');show('voiceRoomPanel');$('voiceRoomTitle').textContent='🔊 '+ch.name;
    $('voiceRoomStatus').textContent='Voice channels support small groups; best for up to 4 people.';
    $('joinVoiceBtn').onclick=()=>joinVoiceRoom(ch);return;
  }
  hide('voiceRoomPanel');show('communityChat');
  const {data:messages,error}=await sb.from('server_messages').select('id,user_id,content,created_at').eq('channel_id',ch.id).order('created_at').limit(100);
  if(error){communityNotice(error.message);return}
  renderCommunityMessages(messages||[]);
  if(chatSubscription)await sb.removeChannel(chatSubscription);
  chatSubscription=sb.channel('community-chat-'+ch.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'server_messages',filter:'channel_id=eq.'+ch.id},async payload=>{
    const row=payload.new;const {data:p}=await sb.from('profiles').select('username').eq('id',row.user_id).maybeSingle();
    appendCommunityMessage(row,p?.username||'member');
  }).subscribe();
}
function appendCommunityMessage(row,username){
  const box=$('chatMessages');if(!box)return;
  if(box.querySelector('[data-message-id="'+row.id+'"]'))return;
  const item=document.createElement('div');item.className='community-message';item.dataset.messageId=row.id;
  const name=document.createElement('b');name.textContent='@'+username;
  const body=document.createElement('p');body.textContent=row.content;
  const time=document.createElement('small');time.textContent=new Date(row.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  item.append(name,body,time);box.append(item);box.scrollTop=box.scrollHeight;
}
async function renderCommunityMessages(rows){
  const box=$('chatMessages');box.replaceChildren();
  const ids=[...new Set(rows.map(r=>r.user_id))];
  const {data:profiles}=ids.length?await sb.from('profiles').select('id,username').in('id',ids):{data:[]};
  const names=new Map((profiles||[]).map(p=>[p.id,p.username]));
  rows.forEach(r=>appendCommunityMessage(r,names.get(r.user_id)||'member'));
}
$('chatForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const content=$('chatInput').value.trim();if(!content||!activeTextChannel||activeTextChannel.type!=='text')return;
  const {error}=await sb.from('server_messages').insert({channel_id:activeTextChannel.id,user_id:user.id,content});
  if(error)communityNotice(error.message);else $('chatInput').value='';
});
$('createServerBtn')?.addEventListener('click',createServer);
$('joinServerBtn')?.addEventListener('click',joinServer);
$('copyInviteBtn')?.addEventListener('click',async()=>{const code=$('copyInviteBtn').dataset.code;if(code){await navigator.clipboard.writeText(code);communityNotice('Invite code copied: '+code)}});
async function createCommunityChannel(type){
  if(!activeServer){communityNotice('Create or select a community first.');return}
  const name=$('newChannelInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,32);
  if(name.length<2){communityNotice('Enter a channel name.');return}
  const {error}=await sb.from('server_channels').insert({server_id:activeServer.id,name,type});
  if(error){communityNotice(error.message);return}
  $('newChannelInput').value='';await openServer(activeServer);communityNotice('Channel created.');
}
$('createTextChannelBtn')?.addEventListener('click',()=>createCommunityChannel('text'));
$('createVoiceChannelBtn')?.addEventListener('click',()=>createCommunityChannel('voice'));

// Community voice rooms use LiveKit's hosted SFU instead of peer-to-peer mesh.
function renderLiveKitParticipants(room){
  const box=$('voiceParticipants');if(!box)return;box.replaceChildren();
  const self=document.createElement('span');self.className='voice-person';self.textContent='You';box.append(self);
  room.remoteParticipants.forEach(p=>{const item=document.createElement('span');item.className='voice-person';item.textContent='@'+(p.name||p.identity.slice(0,10));box.append(item)});
}
async function joinVoiceRoom(ch){
  if(voiceRoom)await leaveVoiceRoom();
  try{
    voiceRoom=ch;voiceMuted=false;
    $('voiceRoomStatus').textContent='Connecting to secure voice…';
    await connectLiveKitRoom('goobert-community-'+ch.id,'community');
    $('voiceRoomStatus').textContent='Connected to voice channel';
    hide('joinVoiceBtn');show('leaveVoiceBtn');show('voiceMuteBtn');$('voiceMuteBtn').textContent='Mute mic';
    renderLiveKitParticipants(liveKitRoom);
  }catch(e){communityNotice('Could not join voice: '+e.message);await leaveVoiceRoom()}
}
async function leaveVoiceRoom(){
  if(voiceRoom){await disconnectLiveKitRoom()}
  voiceMuted=false;voiceRoom=null;hide('voiceMuteBtn');if($('voiceRoomStatus'))$('voiceRoomStatus').textContent='Not connected';hide('leaveVoiceBtn');show('joinVoiceBtn');$('voiceParticipants')?.replaceChildren();
}
$('leaveVoiceBtn')?.addEventListener('click',leaveVoiceRoom);
$('voiceMuteBtn')?.addEventListener('click',async()=>{
  if(!liveKitRoom)return;voiceMuted=!voiceMuted;
  await liveKitRoom.localParticipant.setMicrophoneEnabled(!voiceMuted);
  $('voiceMuteBtn').textContent=voiceMuted?'Unmute mic':'Mute mic';
});
$('leaveServerBtn')?.addEventListener('click',async()=>{
  if(!activeServer)return;
  const deleting=activeServer.owner_id===user.id;
  if(!confirm(deleting?'Delete this community for everyone? This cannot be undone.':'Leave '+activeServer.name+'?'))return;
  if(voiceRoom)await leaveVoiceRoom();
  if(chatSubscription){await sb.removeChannel(chatSubscription);chatSubscription=null}
  const query=deleting?sb.from('servers').delete().eq('id',activeServer.id):sb.from('server_members').delete().eq('server_id',activeServer.id).eq('user_id',user.id);
  const {error}=await query;
  if(error){communityNotice(error.message);return}
  activeServer=null;activeTextChannel=null;hide('serverWorkspace');await loadServers();communityNotice(deleting?'Community deleted.':'You left the community.');
});

async function configureTurn(){
  const saved=JSON.parse(localStorage.getItem('goobert_metered')||'{}');
  const domain=prompt('Metered app domain (example: myapp.metered.live). Find it in Metered Dashboard → Developers:',saved.domain||'');
  if(domain===null)return;
  const apiKey=prompt('Metered TURN credential API key (NOT your account Secret Key). Find it under TURN Credentials → Get credential → Show API Key:',saved.apiKey||'');
  if(apiKey===null)return;
  const cleanDomain=domain.trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!/^[a-z0-9.-]+\.metered\.live$/i.test(cleanDomain)||!apiKey.trim()){communityNotice('Please enter your Metered app domain and TURN credential API key.');return}
  communityNotice('Connecting to the free TURN relay…');
  try{
    const response=await fetch('https://'+cleanDomain+'/api/v1/turn/credentials?apiKey='+encodeURIComponent(apiKey.trim()));
    if(!response.ok)throw new Error('Metered returned HTTP '+response.status+'. Check the domain and credential API key.');
    const iceServers=await response.json();
    if(!Array.isArray(iceServers)||!iceServers.some(s=>String(s.urls||'').includes('turn')))throw new Error('The provider did not return TURN servers. Check that this is a TURN credential API key, not your account Secret Key.');
    localStorage.setItem('goobert_metered',JSON.stringify({domain:cleanDomain,apiKey:apiKey.trim()}));
    localStorage.setItem('goobert_ice_servers',JSON.stringify(iceServers));
    localStorage.removeItem('goobert_turn');
    communityNotice('TURN relay connected and saved in this browser. Wait 2 minutes after creating a new Metered credential, then reload Goobert and call again.');
  }catch(e){console.error('TURN setup failed:',e);communityNotice('TURN setup failed: '+e.message)}
}
$('enableCallAlerts')?.addEventListener('click',enableCallAlerts);
$('quickSettings')?.addEventListener('click',()=>{
  const choice=prompt('Account settings:\n1 = Connect free Metered TURN relay\n2 = Clear TURN settings\nEnter 1 or 2:','1');
  if(choice==='1')configureTurn();else if(choice==='2'){localStorage.removeItem('goobert_turn');localStorage.removeItem('goobert_ice_servers');localStorage.removeItem('goobert_metered');communityNotice('TURN settings cleared.')}
});

$('openDmFromStage').onclick=()=>{if(currentDmUser)show('directMessagePanel');else $('userSearch').focus()};
boot();
