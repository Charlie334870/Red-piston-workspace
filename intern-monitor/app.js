/* ===================================================
   AutoMobile — Intern Workspace Monitor | app.js
   Full rewrite with Chat, Video Call, Calendar
   =================================================== */

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════
let interns       = JSON.parse(localStorage.getItem('am_interns')   || '[]');
let chatMessages  = JSON.parse(localStorage.getItem('am_chat')      || '{}');
let meetings      = JSON.parse(localStorage.getItem('am_meetings')  || '[]');

let selectedInternId   = null;
let activeChatInternId = null;
let clockIntervalId    = null;
let callTimerInterval  = null;
let callStartTime      = null;
let localStream        = null;
let isMuted            = false;
let isCamOff           = false;
let isSharing          = false;
let taskFilter         = 'all';
let calYear, calMonth;
let typingTimeout      = null;

// ── Auth state ────────────────────────────────────
let currentUser = null; // { role: 'manager'|'intern', internId: string|null, name: string }
let credentials = JSON.parse(localStorage.getItem('am_credentials') || '{}');

const MANAGER_NAME = 'Manager';
const MANAGER_ID   = 'manager';

const AVATAR_COLORS = [
    'linear-gradient(135deg,#e63946,#ff6b6b)',
    'linear-gradient(135deg,#3fb950,#20c997)',
    'linear-gradient(135deg,#58a6ff,#bc8cff)',
    'linear-gradient(135deg,#f0ad4e,#f78166)',
    'linear-gradient(135deg,#bc8cff,#58a6ff)',
    'linear-gradient(135deg,#20c997,#58a6ff)',
];

const EMOJIS = ['😊','👍','✅','🔥','💡','🚀','⚡','🎯'];

// ══════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════
const avatarColor = id => AVATAR_COLORS[Math.abs(parseInt(id,10) || id.charCodeAt(0)) % AVATAR_COLORS.length];
const initials    = name => name.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2);
const ts          = ()   => Date.now();
const ms          = h    => Math.round(h * 3600000);
const ago         = h    => Date.now() - ms(h);
const todayStr    = ()   => new Date().toISOString().slice(0,10);
const capitalise  = s    => s.charAt(0).toUpperCase() + s.slice(1);
const escHtml     = s    => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const getIntern   = id   => interns.find(i => i.id === id);

function getChatThreadKey(idA, idB) {
    if (idA === MANAGER_ID || idB === MANAGER_ID) {
        const internId = idA === MANAGER_ID ? idB : idA;
        return `${internId}_manager`;
    }
    return [idA, idB].sort().join('_');
}

function migrateChatData() {
    let migrated = false;
    for (const key in chatMessages) {
        // If key is just numeric (old style), migrate to internID_manager
        if (!key.includes('_') && key !== 'manager') {
            const newKey = `${key}_manager`;
            chatMessages[newKey] = chatMessages[key];
            delete chatMessages[key];
            migrated = true;
        }
    }
    if (migrated) save();
}

function save() {
    localStorage.setItem('am_interns',      JSON.stringify(interns));
    localStorage.setItem('am_chat',         JSON.stringify(chatMessages));
    localStorage.setItem('am_meetings',     JSON.stringify(meetings));
    localStorage.setItem('am_credentials',  JSON.stringify(credentials));
}

function todayDayIndex() { return (new Date().getDay() + 6) % 7; }

function relativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return new Date(timestamp).toLocaleDateString();
}

function fmtClock(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0
        ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getMeetingParticipantNames(meeting) {
    return (meeting.internIds || [])
        .map(id => getIntern(id)?.name || 'Unknown')
        .join(', ') || 'No participants';
}

// ══════════════════════════════════════════════════
// SEED DEMO DATA
// ══════════════════════════════════════════════════
function seedIfEmpty() {
    if (interns.length === 0) {
        const demos = [
            {
                name:'Aryan Mehta', role:'Software Intern', email:'aryan@automobile.com', status:'online',
                tasks:[
                    {id:'t1',text:'Review pull request #42',priority:'high',done:false,created:ts()},
                    {id:'t2',text:'Update API documentation',priority:'medium',done:true,created:ts()},
                    {id:'t3',text:'Fix login redirect bug',priority:'high',done:false,created:ts()},
                ],
                weeklyHours:[6.5,7.2,5.8,8.0,1.4,0,0],
                clockedIn:false,clockStart:null,todayMs:ms(1.4),totalMs:ms(35.2),
                activity:[
                    {type:'clock',msg:'Clocked in at 9:00 AM',time:ago(2)},
                    {type:'task',msg:'Completed: Update API documentation',time:ago(1)},
                ]
            },
            {
                name:'Simran Kaur', role:'Design Intern', email:'simran@automobile.com', status:'away',
                tasks:[
                    {id:'t4',text:'Design onboarding screens',priority:'high',done:false,created:ts()},
                    {id:'t5',text:'Create icon set',priority:'low',done:true,created:ts()},
                ],
                weeklyHours:[4.5,6.0,7.5,6.8,0.8,0,0],
                clockedIn:false,clockStart:null,todayMs:ms(0.8),totalMs:ms(28.4),
                activity:[
                    {type:'status',msg:'Status changed to Away',time:ago(0.5)},
                    {type:'clock',msg:'Clocked in at 9:30 AM',time:ago(1.5)},
                ]
            },
            {
                name:'Dev Patel', role:'Marketing Intern', email:'dev@automobile.com', status:'online',
                tasks:[
                    {id:'t6',text:'Write Q1 campaign brief',priority:'medium',done:false,created:ts()},
                    {id:'t7',text:'Analyse competitor data',priority:'high',done:true,created:ts()},
                    {id:'t8',text:'Schedule social posts',priority:'low',done:true,created:ts()},
                ],
                weeklyHours:[7.0,8.0,7.5,6.5,2.1,0,0],
                clockedIn:false,clockStart:null,todayMs:ms(2.1),totalMs:ms(38.6),
                activity:[
                    {type:'clock',msg:'Clocked in at 8:45 AM',time:ago(2.5)},
                    {type:'task',msg:'Completed: Analyse competitor data',time:ago(2)},
                    {type:'task',msg:'Completed: Schedule social posts',time:ago(1)},
                ]
            },
        ];
        let nextId = 1;
        demos.forEach(d => interns.push({id:String(nextId++), ...d}));
    }

    // Seed demo chat messages (Migrated to thread-keyed pairs)
    if (Object.keys(chatMessages).length === 0) {
        // Aryan ↔ Manager
        chatMessages['1_manager'] = [
            {id:'m1',from:MANAGER_ID,text:'Hey Aryan! How is the PR review going?',time:ago(1.5),read:true},
            {id:'m2',from:'1',text:'Almost done! Should have it ready by noon 👍',time:ago(1.4),read:true},
        ];
        // Aryan ↔ Simran (Intern ↔ Intern)
        chatMessages['1_2'] = [
            {id:'m10',from:'1',text:'Hey Simran! Did you finish the icons for the dashboard?',time:ago(5),read:true},
            {id:'m11',from:'2',text:'Just uploading them now! Check the Figma link.',time:ago(4.8),read:true},
            {id:'m12',from:'1',text:'Awesome, they look great!',time:ago(4.5),read:true},
        ];
        // Simran ↔ Dev
        chatMessages['2_3'] = [
            {id:'m15',from:'2',text:'Dev, are we still on for the sync at 3?',time:ago(2),read:true},
            {id:'m16',from:'3',text:'Yes! I have the updated reports ready.',time:ago(1.8),read:true},
        ];
        // Simran ↔ Manager
        chatMessages['2_manager'] = [
            {id:'m5',from:MANAGER_ID,text:'Simran, the onboarding screens look great!',time:ago(2),read:true},
        ];
    }

    // Seed demo meetings
    if (meetings.length === 0) {
        const now = new Date();
        const todayDate = now.toISOString().slice(0,10);
        const tomorrow  = new Date(now.getTime() + 86400000).toISOString().slice(0,10);
        
        meetings = [
            {
                id: 'meet1', 
                title: 'Intern Collaborative Sync', 
                internIds: ['1', '2', '3'], 
                date: todayDate, 
                time: '11:00', // Making it close to "now" for testing live join
                duration: 45, 
                notes: 'Weekly progress sync',
                organizer: 'manager'
            },
            {
                id: 'meet-intern', 
                title: 'Project Alpha Planning', 
                internIds: ['1', '2'], 
                date: tomorrow, 
                time: '14:30', 
                duration: 30, 
                notes: 'Discuss font choices',
                organizer: '1' // Scheduled by Aryan
            }
        ];
    }

    save();

    // Seed credentials for demo users
    if (Object.keys(credentials).length === 0) {
        credentials['manager'] = 'manager123';
        interns.forEach(intern => {
            credentials[intern.id] = intern.name.split(' ')[0].toLowerCase();
        });
        localStorage.setItem('am_credentials', JSON.stringify(credentials));
    }
}

// ══════════════════════════════════════════════════
// TOPBAR CLOCK
// ══════════════════════════════════════════════════
function startTopbarClock() {
    const el = document.getElementById('topbarClock');
    const tick = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    };
    tick();
    setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════
// VIEW SWITCHING
// ══════════════════════════════════════════════════
function switchView(view) {
    document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view-pane').forEach(p => {
        const isTarget = p.id === `view${capitalise(view)}`;
        p.classList.toggle('active', isTarget);
        // Remove 'hidden' from the target pane so it can display
        if (isTarget) {
            p.classList.remove('hidden');
        }
    });

    if (view === 'chat') renderChatSidebar();
    if (view === 'calendar') renderCalendar();
}

// ══════════════════════════════════════════════════
// SIDEBAR (dashboard)
// ══════════════════════════════════════════════════
function renderSidebar(filter = '') {
    const list  = document.getElementById('internList');
    const count = document.getElementById('internCount');
    const q     = filter.toLowerCase();
    const visible = interns.filter(i => i.name.toLowerCase().includes(q) || i.role.toLowerCase().includes(q));
    count.textContent = interns.length;
    list.innerHTML = '';

    if (visible.length === 0) {
        list.innerHTML = `<li style="padding:20px 12px;text-align:center;color:var(--text-muted);font-size:0.82rem;">No results found</li>`;
        return;
    }

    visible.forEach(intern => {
        const done  = intern.tasks.filter(t => t.done).length;
        const total = intern.tasks.length;
        const unread = getUnreadCount(intern.id);
        const li = document.createElement('li');
        li.className = 'intern-item' + (intern.id === selectedInternId ? ' active' : '');
        li.dataset.id = intern.id;
        li.innerHTML = `
            <div class="intern-avatar" style="background:${avatarColor(intern.id)}">
                ${initials(intern.name)}
                <span class="status-indicator" data-status="${intern.status}"></span>
            </div>
            <div class="intern-info">
                <div class="name">${intern.name}</div>
                <div class="role">${intern.role}</div>
            </div>
            ${unread > 0 ? `<span class="chat-unread-badge">${unread}</span>` : `<span class="task-badge">${done}/${total}</span>`}
        `;
        li.addEventListener('click', () => selectIntern(intern.id));
        list.appendChild(li);
    });
}

// ══════════════════════════════════════════════════
// SELECT INTERN (dashboard)
// ══════════════════════════════════════════════════
function selectIntern(id) {
    selectedInternId = id;
    const intern = getIntern(id);
    if (!intern) return;

    document.querySelectorAll('.intern-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('internDashboard').classList.remove('hidden');

    document.getElementById('dashAvatar').textContent = initials(intern.name);
    document.getElementById('dashAvatar').style.background = avatarColor(id);
    document.getElementById('dashName').textContent = intern.name;
    document.getElementById('dashRole').textContent = intern.role;

    const sb = document.getElementById('dashStatus');
    sb.dataset.status = intern.status;
    sb.innerHTML = `<span class="status-dot"></span>${capitalise(intern.status)}`;

    updateClockBtn(intern);
    updateHoursStats(intern);
    updateTaskStats(intern);
    updateWeeklyStats(intern);
    updateActivityScore(intern);
    renderTasks(intern);
    renderWeekly(intern);
    renderActivity(intern);
    startRunningClock();
}

function startRunningClock() {
    clearInterval(clockIntervalId);
    clockIntervalId = setInterval(() => {
        const intern = getIntern(selectedInternId);
        if (intern) updateHoursStats(intern);
    }, 1000);
}

// ── Stats ─────────────────────────────────────────
function updateHoursStats(intern) {
    let todayMs = intern.todayMs || 0;
    if (intern.clockedIn && intern.clockStart) todayMs += Date.now() - intern.clockStart;
    const hours = todayMs / 3600000;
    const pct   = Math.min((hours / 8) * 100, 100);
    document.getElementById('statHoursVal').textContent = hours.toFixed(1) + 'h';
    document.getElementById('hoursProgress').style.setProperty('--progress', pct.toFixed(1)+'%');
}

function updateTaskStats(intern) {
    const done  = intern.tasks.filter(t => t.done).length;
    const total = intern.tasks.length;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
    document.getElementById('statTasksVal').textContent = pct + '%';
    document.getElementById('taskRing').style.strokeDashoffset = 106.8 - (106.8 * pct / 100);
}

function updateWeeklyStats(intern) {
    const total = (intern.weeklyHours || []).reduce((a,b) => a+b, 0);
    document.getElementById('statWeeklyVal').textContent = total.toFixed(0) + 'h';
}

function updateActivityScore(intern) {
    const score  = Math.min(intern.activity ? intern.activity.length : 0, 100);
    document.getElementById('statActivityVal').textContent = score;
    const active = Math.min(Math.ceil(score / 20), 5);
    document.querySelectorAll('#activityDots .dot').forEach((d, i) => d.classList.toggle('active', i < active));
}

function updateClockBtn(intern) {
    const btn  = document.getElementById('btnClockIn');
    const text = document.getElementById('clockBtnText');
    btn.classList.toggle('clocked-in', intern.clockedIn);
    text.textContent = intern.clockedIn ? 'Clock Out' : 'Clock In';
}

// ── Tasks ─────────────────────────────────────────
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function renderTasks(intern) {
    const list = document.getElementById('tasksList');
    let tasks = [...intern.tasks];
    if (taskFilter === 'active') tasks = tasks.filter(t => !t.done);
    else if (taskFilter === 'done') tasks = tasks.filter(t => t.done);
    list.innerHTML = '';

    if (tasks.length === 0) {
        list.innerHTML = `<div class="tasks-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="4" width="24" height="24" rx="4" stroke="currentColor" stroke-width="1.5"/><path d="M10 16h12M10 11h12M10 21h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><div>No tasks here</div></div>`;
        return;
    }

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item' + (task.done ? ' done' : '');
        div.innerHTML = `
            <div class="task-check"></div>
            <span class="task-text">${escHtml(task.text)}</span>
            <span class="task-priority" data-priority="${task.priority}">${task.priority}</span>
            <button class="task-delete" data-id="${task.id}" title="Delete" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px 4px;border-radius:4px;font-size:0.75rem;transition:var(--transition)">✕</button>
        `;
        div.querySelector('.task-check').addEventListener('click', e => { e.stopPropagation(); toggleTask(task.id); });
        div.querySelector('.task-text').addEventListener('click', () => toggleTask(task.id));
        div.querySelector('.task-delete').addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });
        list.appendChild(div);
    });
}

function toggleTask(taskId) {
    const intern = getIntern(selectedInternId);
    if (!intern) return;
    const task = intern.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    if (task.done) logActivity(intern, 'task', `Completed: ${task.text}`);
    save();
    renderTasks(intern);
    updateTaskStats(intern);
    updateActivityScore(intern);
    renderSidebar(document.getElementById('searchInput').value);
}

function deleteTask(taskId) {
    const intern = getIntern(selectedInternId);
    if (!intern) return;
    intern.tasks = intern.tasks.filter(t => t.id !== taskId);
    save();
    renderTasks(intern);
    updateTaskStats(intern);
    renderSidebar(document.getElementById('searchInput').value);
}

function addTask(text, priority) {
    const intern = getIntern(selectedInternId);
    if (!intern || !text.trim()) return;
    intern.tasks.push({id:'t'+ts(), text:text.trim(), priority, done:false, created:ts()});
    logActivity(intern, 'task', `New task added: ${text.trim()}`);
    save();
    renderTasks(intern);
    updateTaskStats(intern);
    updateActivityScore(intern);
    renderSidebar(document.getElementById('searchInput').value);
}

// ── Weekly ────────────────────────────────────────
function renderWeekly(intern) {
    const container = document.getElementById('weeklyBars');
    const todayIdx  = todayDayIndex();
    const hours     = intern.weeklyHours || [0,0,0,0,0,0,0];
    const maxH      = Math.max(...hours, 8);
    container.innerHTML = '';
    DAYS.forEach((day, i) => {
        const h   = hours[i] || 0;
        const pct = maxH > 0 ? (h / maxH) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'weekly-bar-row';
        row.innerHTML = `
            <span class="weekly-day${i===todayIdx?' today':''}">${day}</span>
            <div class="weekly-track"><div class="weekly-fill${i===todayIdx?' today-fill':''}" style="width:${pct.toFixed(1)}%"></div></div>
            <span class="weekly-hours">${h.toFixed(1)}</span>`;
        container.appendChild(row);
    });
}

// ── Activity Feed ─────────────────────────────────
function logActivity(intern, type, msg) {
    intern.activity = intern.activity || [];
    intern.activity.unshift({type, msg, time:ts()});
    intern.activity = intern.activity.slice(0, 50);
}

const ACTIVITY_ICONS = {clock:'⏱',task:'✓',note:'📝',status:'●'};

function renderActivity(intern) {
    const feed  = document.getElementById('activityFeed');
    const items = intern.activity || [];
    feed.innerHTML = '';
    if (items.length === 0) {
        feed.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.82rem;">No activity yet</div>`;
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        div.innerHTML = `
            <div class="activity-icon-wrap ${item.type}">${ACTIVITY_ICONS[item.type]||'•'}</div>
            <div class="activity-content">
                <div class="activity-msg">${escHtml(item.msg)}</div>
                <div class="activity-time">${relativeTime(item.time)}</div>
            </div>`;
        feed.appendChild(div);
    });
}

// ── Modals (Add Intern) ───────────────────────────
function openModal() {
    document.getElementById('addInternModal').classList.remove('hidden');
    ['internName','internRole','internEmail'].forEach(id => document.getElementById(id).value = '');
    setTimeout(() => document.getElementById('internName').focus(), 50);
}

function closeModal() {
    document.getElementById('addInternModal').classList.add('hidden');
}

function addIntern() {
    const name  = document.getElementById('internName').value.trim();
    const role  = document.getElementById('internRole').value.trim();
    const email = document.getElementById('internEmail').value.trim();
    if (!name) { shakeInput('internName'); return; }
    const id = String(Date.now());
    interns.push({
        id, name, role:role||'Intern', email,
        status:'online', tasks:[],
        weeklyHours:[0,0,0,0,0,0,0],
        clockedIn:false, clockStart:null,
        todayMs:0, totalMs:0,
        activity:[{type:'note',msg:'Profile created',time:ts()}]
    });
    // Set default password for new intern
    credentials[id] = name.split(' ')[0].toLowerCase();
    save();
    closeModal();
    renderSidebar();
    selectIntern(id);
    // Update login dropdown if it's populated
    populateLoginDropdown();
}

function shakeInput(id) {
    const el = document.getElementById(id);
    el.style.borderColor = 'var(--red-primary)';
    el.style.boxShadow   = '0 0 0 3px rgba(230,57,70,0.2)';
    setTimeout(() => { el.style.borderColor=''; el.style.boxShadow=''; }, 1500);
}

// ── Clock In/Out ──────────────────────────────────
function toggleClock() {
    const intern = getIntern(selectedInternId);
    if (!intern) return;
    if (!intern.clockedIn) {
        intern.clockedIn  = true;
        intern.clockStart = ts();
        logActivity(intern, 'clock', `Clocked in at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);
    } else {
        const sessionMs = ts() - intern.clockStart;
        intern.todayMs += sessionMs;
        intern.totalMs += sessionMs;
        intern.weeklyHours[todayDayIndex()] = intern.todayMs / 3600000;
        intern.clockedIn  = false;
        intern.clockStart = null;
        logActivity(intern, 'clock', `Clocked out at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);
        updateWeeklyStats(intern);
        renderWeekly(intern);
    }
    save();
    updateClockBtn(intern);
    updateHoursStats(intern);
    renderActivity(intern);
    updateActivityScore(intern);
}

// ── Status ────────────────────────────────────────
const STATUSES = ['online','away','break','offline'];

function cycleStatus() {
    const intern = getIntern(selectedInternId);
    if (!intern) return;
    intern.status = STATUSES[(STATUSES.indexOf(intern.status) + 1) % STATUSES.length];
    logActivity(intern, 'status', `Status changed to ${capitalise(intern.status)}`);
    save();
    const sb = document.getElementById('dashStatus');
    sb.dataset.status = intern.status;
    sb.innerHTML = `<span class="status-dot"></span>${capitalise(intern.status)}`;
    renderSidebar(document.getElementById('searchInput').value);
    renderActivity(intern);
    updateActivityScore(intern);
}

function setTaskFilter(filter) {
    taskFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
    const intern = getIntern(selectedInternId);
    if (intern) renderTasks(intern);
}

// ══════════════════════════════════════════════════
// CHAT MODULE
// ══════════════════════════════════════════════════
function getUnreadCount(internId) {
    const msgs = chatMessages[internId] || [];
    // In a real app this would use a read-cursor. We'll mark all manager messages the intern "sent" as read.
    // For demo purposes, unread = messages from intern not yet "seen" (simulate with a flag)
    return msgs.filter(m => m.from !== MANAGER_ID && !m.read).length;
}

function updateChatTabBadge() {
    const myId  = currentUser.internId || MANAGER_ID;
    let total = 0;
    // Count unread messages in all threads I am part of
    for (const key in chatMessages) {
        if (key.includes(myId)) {
            total += (chatMessages[key] || []).filter(m => !m.read && m.from !== myId).length;
        }
    }
    const badge = document.getElementById('chatTabBadge');
    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }
}

function renderChatSidebar(query = '') {
    const list = document.getElementById('chatInternList');
    if (!list) return;
    list.innerHTML = '';
    
    // Contacts list: Manager (if you are an intern) + all other interns
    let contacts = [];
    if (currentUser.role === 'intern') {
        contacts.push({ id: MANAGER_ID, name: 'Manager', role: 'Team Lead', avatar: 'M', isManager: true });
    }
    
    interns.forEach(i => {
        if (i.id !== currentUser.internId) {
            contacts.push({ ...i, isManager: false });
        }
    });

    if (query) {
        contacts = contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    }

    contacts.forEach(contact => {
        const threadKey = getChatThreadKey(currentUser.internId || MANAGER_ID, contact.id);
        const msgs      = chatMessages[threadKey] || [];
        const last      = msgs[msgs.length - 1];
        const isActive  = activeChatInternId === contact.id;

        const li = document.createElement('li');
        li.className = `chat-intern-item ${isActive ? 'active' : ''} ${contact.status === 'online' ? 'is-online' : ''}`;
        li.dataset.id = contact.id;
        
        const avatarBg = contact.isManager ? 'linear-gradient(135deg, var(--red-primary), var(--red-light))' : avatarColor(contact.id);
        const avatarTxt = contact.isManager ? 'M' : initials(contact.name);

        li.innerHTML = `
            <div class="chat-item-avatar" style="background:${avatarBg}">${avatarTxt}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${contact.name}</div>
                <div class="chat-item-preview">${last ? escHtml(last.text.slice(0,36)) + (last.text.length>36?'…':'') : 'Start a conversation'}</div>
            </div>
            ${!isActive && msgs.filter(m => !m.read && m.from !== (currentUser.internId || MANAGER_ID)).length > 0 ? `<div class="chat-unread-badge"></div>` : ''}
        `;
        
        li.addEventListener('click', () => openChatThread(contact.id));
        list.appendChild(li);
    });
}

function openChatThread(contactId) {
    activeChatInternId = contactId;
    const contact = contactId === MANAGER_ID ? { name: 'Manager', role: 'Team Lead', isManager: true } : getIntern(contactId);
    if (!contact) return;

    document.getElementById('chatEmpty').classList.add('hidden');
    document.getElementById('chatThread').classList.remove('hidden');

    const av = document.getElementById('chatThreadAvatar');
    av.textContent = contact.isManager ? 'M' : initials(contact.name);
    av.style.background = contact.isManager ? 'linear-gradient(135deg, var(--red-primary), var(--red-light))' : avatarColor(contactId);
    document.getElementById('chatThreadName').textContent = contact.name;
    document.getElementById('chatThreadRole').textContent = contact.role;

    renderChatMessages(contactId);
    renderChatSidebar(); 
    document.getElementById('chatInput').focus();
    
    const callBtn = document.getElementById('btnCallFromChat');
    if (callBtn) callBtn.onclick = () => startCall(contactId);
}

function renderChatMessages(contactId) {
    const container = document.getElementById('chatMessages');
    const myId      = currentUser.internId || MANAGER_ID;
    const threadKey = getChatThreadKey(myId, contactId);
    const msgs      = chatMessages[threadKey] || [];
    container.innerHTML = '';

    if (msgs.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:0.82rem;">Say hello! 👋</div>`;
        return;
    }

    // Mark as read
    msgs.forEach(m => { if (m.from !== myId) m.read = true; });
    save();

    let lastDate = '';
    msgs.forEach(msg => {
        const msgDate = new Date(msg.time).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
        if (msgDate !== lastDate) {
            const divider = document.createElement('div');
            divider.className = 'msg-date-divider';
            divider.innerHTML = `<span>${msgDate}</span>`;
            container.appendChild(divider);
            lastDate = msgDate;
        }

        const isMe     = msg.from === myId;
        const row      = document.createElement('div');
        row.className  = 'msg-row ' + (isMe ? 'sent' : 'received');
        const timeStr  = new Date(msg.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

        if (!isMe) {
            const sender = msg.from === MANAGER_ID ? { name: 'Manager' } : getIntern(msg.from);
            const avatarBg = msg.from === MANAGER_ID ? 'linear-gradient(135deg, var(--red-primary), var(--red-light))' : avatarColor(msg.from);
            const avatarTxt = msg.from === MANAGER_ID ? 'M' : initials(sender?.name || 'I');
            row.innerHTML = `
                <div class="msg-avatar" style="background:${avatarBg}">${avatarTxt}</div>
                <div class="msg-bubble">${escHtml(msg.text)}</div>
                <span class="msg-time">${timeStr}</span>`;
        } else {
            row.innerHTML = `
                <span class="msg-time">${timeStr}</span>
                <div class="msg-bubble">${escHtml(msg.text)}</div>`;
        }
        container.appendChild(row);
    });

    container.scrollTop = container.scrollHeight;
}

function sendMessage(text) {
    if (!text.trim() || !activeChatInternId) return;
    const myId      = currentUser.internId || MANAGER_ID;
    const threadKey = getChatThreadKey(myId, activeChatInternId);
    
    if (!chatMessages[threadKey]) chatMessages[threadKey] = [];
    chatMessages[threadKey].push({
        id: 'msg' + ts(),
        from: myId,
        text: text.trim(),
        time: ts(),
        read: false
    });
    save();
    renderChatMessages(activeChatInternId);
    renderChatSidebar();
    updateChatTabBadge();

    // Simulated reply
    const target = activeChatInternId === MANAGER_ID ? { name: 'Manager' } : getIntern(activeChatInternId);
    if (target) {
        simulateReply(target);
    }
}

function simulateReply(target) {
    clearTimeout(typingTimeout);
    const typingEl = document.getElementById('chatTyping');
    document.getElementById('typingLabel').textContent = `${target.name.split(' ')[0]} is typing...`;
    typingEl.classList.remove('hidden');
    document.getElementById('chatMessages').scrollTop = 99999;

    const replies = [
        'Got it, thanks! 👍','Sure thing!','On it!','Will do!','Thanks for the update 🙏',
        'Sounds good!','Noted 📝','I\'ll check that right away','Perfect, I\'ll handle it!',
    ];

    typingTimeout = setTimeout(() => {
        typingEl.classList.add('hidden');
        if (activeChatInternId === target.id || (target.id === MANAGER_ID && activeChatInternId === MANAGER_ID)) {
            const reply = replies[Math.floor(Math.random() * replies.length)];
            const myId  = currentUser.internId || MANAGER_ID;
            const threadKey = getChatThreadKey(myId, target.id);
            
            chatMessages[threadKey].push({id:'msg'+ts(), from:target.id, text:reply, time:ts(), read:false});
            save();
            renderChatMessages(activeChatInternId);
            renderChatSidebar();
        }
    }, 1500 + Math.random() * 1500);
}

function openChatFor(contactId) {
    switchView('chat');
    setTimeout(() => openChatThread(contactId), 50);
}

// ══════════════════════════════════════════════════
// VIDEO CALL MODULE
// ══════════════════════════════════════════════════
function startCall(contactId) {
    const contact = contactId === MANAGER_ID ? { name: 'Manager' } : getIntern(contactId);
    if (!contact) return;

    const modal = document.getElementById('videoCallModal');
    if (modal) modal.classList.remove('hidden');

    const remAvatar = document.getElementById('callRemoteAvatar');
    if (remAvatar) {
        remAvatar.textContent = contact.isManager ? 'M' : initials(contact.name);
        remAvatar.style.background = contact.isManager ? 'linear-gradient(135deg, var(--red-primary), var(--red-light))' : avatarColor(contactId);
    }

    const nameLabel = document.getElementById('callInternName');
    if (nameLabel) nameLabel.textContent = contact.name;
    
    const statusLabel = document.getElementById('callStatusLabel');
    if (statusLabel) statusLabel.textContent = 'Calling…';
    
    const timerLabel = document.getElementById('callTimer');
    if (timerLabel) timerLabel.textContent = '00:00';

    // Reset controls
    isMuted = false; isCamOff = false; isSharing = false;
    const btnMute = document.getElementById('btnToggleMute');
    const btnCam  = document.getElementById('btnToggleCamera');
    const btnShare = document.getElementById('btnScreenShare');
    if (btnMute) btnMute.classList.remove('muted');
    if (btnCam)  btnCam.classList.remove('cam-off');
    if (btnShare) btnShare.classList.remove('active');

    // Request camera
    const localVid = document.getElementById('localVideo');
    const localPlaceholder = document.getElementById('callLocalPlaceholder');

    navigator.mediaDevices?.getUserMedia({video:true, audio:true})
        .then(stream => {
            localStream = stream;
            if (localVid) localVid.srcObject = stream;
            if (localPlaceholder) localPlaceholder.style.display = 'none';
        })
        .catch(() => {
            if (localPlaceholder) localPlaceholder.style.display = 'flex';
        });

    setTimeout(() => {
        if (statusLabel) statusLabel.textContent = 'Connected';
        startCallTimer();
    }, 2000);
}

function startCallTimer() {
    callStartTime = Date.now();
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        document.getElementById('callTimer').textContent = fmtClock(elapsed);
    }, 1000);
}

function endCall() {
    clearInterval(callTimerInterval);
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    const localVid = document.getElementById('localVideo');
    localVid.srcObject = null;
    document.getElementById('callLocalPlaceholder').style.display = 'flex';
    document.getElementById('videoCallModal').classList.add('hidden');
}

function toggleMute() {
    isMuted = !isMuted;
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById('btnToggleMute');
    btn.classList.toggle('muted', isMuted);
    btn.querySelector('span').textContent = isMuted ? 'Unmute' : 'Mute';
}

function toggleCamera() {
    isCamOff = !isCamOff;
    if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    const btn = document.getElementById('btnToggleCamera');
    btn.classList.toggle('cam-off', isCamOff);
    btn.querySelector('span').textContent = isCamOff ? 'Start Cam' : 'Camera';
}

async function toggleScreenShare() {
    const btn = document.getElementById('btnScreenShare');
    if (!isSharing) {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({video:true});
            const localVid = document.getElementById('localVideo');
            localVid.srcObject = screenStream;
            isSharing = true;
            btn.classList.add('active');
            btn.querySelector('span').textContent = 'Stop Share';
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                isSharing = false;
                btn.classList.remove('active');
                btn.querySelector('span').textContent = 'Share';
                if (localStream) localVid.srcObject = localStream;
            });
        } catch(e) { /* user denied */ }
    } else {
        isSharing = false;
        btn.classList.remove('active');
        btn.querySelector('span').textContent = 'Share';
        if (localStream) document.getElementById('localVideo').srcObject = localStream;
    }
}

// ══════════════════════════════════════════════════
// CALENDAR / MEETINGS MODULE
// ══════════════════════════════════════════════════
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalendar() {
    const now = new Date();
    if (calYear === undefined)  { calYear  = now.getFullYear(); calMonth = now.getMonth(); }
    drawCalendar(calYear, calMonth);
    renderUpcomingMeetings();
    document.getElementById('meetingCount').textContent = meetings.length;
}

function drawCalendar(year, month) {
    document.getElementById('calMonthLabel').textContent = `${MONTH_NAMES[month]} ${year}`;
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const today       = new Date();

    // Build an array of day cells
    const cells = [];
    // Prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
        cells.push({day: daysInPrev - i, thisMonth: false, future: false});
    }
    // This month
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({day: d, thisMonth: true});
    }
    // Next month padding (fill to 42)
    let next = 1;
    while (cells.length < 42) cells.push({day: next++, thisMonth: false, future: true});

    cells.forEach(cell => {
        const div = document.createElement('div');
        div.className = 'cal-day';
        if (!cell.thisMonth) div.classList.add('other-month');

        const cellDate = cell.thisMonth
            ? new Date(year, month, cell.day)
            : cell.future
                ? new Date(year, month+1, cell.day)
                : new Date(year, month-1, cell.day);

        if (today.getFullYear()===cellDate.getFullYear() && today.getMonth()===cellDate.getMonth() && today.getDate()===cellDate.getDate()) {
            div.classList.add('today');
        }

        const dateStr = cellDate.toISOString().slice(0,10);
        const dayMeetings = meetings.filter(m => m.date === dateStr);

        div.innerHTML = `<div class="cal-day-num">${cell.day}</div>`;

        if (dayMeetings.length > 0) {
            const evts = document.createElement('div');
            evts.className = 'cal-events';
            dayMeetings.slice(0, 2).forEach(m => {
                const chip = document.createElement('div');
                chip.className = 'cal-event-chip';
                chip.textContent = `${m.time} ${m.title}`;
                chip.title = m.title;
                chip.addEventListener('click', e => { e.stopPropagation(); highlightMeeting(m.id); });
                evts.appendChild(chip);
            });
            if (dayMeetings.length > 2) {
                const more = document.createElement('div');
                more.className = 'cal-event-chip';
                more.style.opacity = '0.6';
                more.textContent = `+${dayMeetings.length-2} more`;
                evts.appendChild(more);
            }
            div.appendChild(evts);
        }

        div.addEventListener('click', () => openScheduleModal(dateStr));
        grid.appendChild(div);
    });
}

function renderUpcomingMeetings() {
    const list    = document.getElementById('upcomingList');
    if (!list) return;
    const now     = new Date();
    const myId    = currentUser.internId || MANAGER_ID;
    
    // Show meetings where I am a participant OR manager view (all)
    const filtered = meetings.filter(m => (currentUser.role === 'manager' || (m.internIds || []).includes(myId)));
    const sorted   = [...filtered].sort((a, b) => new Date(a.date+'T'+a.time) - new Date(b.date+'T'+b.time))
                                 .filter(m => {
                                     const mEnd = new Date(new Date(m.date+'T'+m.time).getTime() + m.duration*60000);
                                     return mEnd >= now;
                                 });

    const mCount = document.getElementById('meetingCount');
    if (mCount) mCount.textContent = sorted.length;
    list.innerHTML = '';
    
    if (sorted.length === 0) {
        list.innerHTML = `<div class="no-meetings">📅<br>No upcoming meetings</div>`;
        return;
    }

    sorted.forEach(meeting => {
        const card = document.createElement('div');
        card.className = 'meeting-card';
        card.id = 'meeting-'+meeting.id;
        
        const mStart = new Date(meeting.date+'T'+meeting.time);
        const mEnd   = new Date(mStart.getTime() + meeting.duration*60000);
        const isLive = now >= mStart && now < mEnd;
        const dateLabel = mStart.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'});
        const participants = getMeetingParticipantNames(meeting);

        card.innerHTML = `
            <div class="meeting-card-title">
                ${isLive ? '<span class="status-dot" style="background:var(--green)"></span> ' : ''}
                ${escHtml(meeting.title)}
            </div>
            <div class="meeting-card-meta">
                <div class="meeting-card-time">
                    <svg width="12" height="12" viewBox="0 0 12-12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3v3l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    ${dateLabel} · ${meeting.time} · ${meeting.duration}m
                </div>
                <div class="meeting-card-participants">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="4.5" cy="3.5" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M1 10c0-2 1.5-3.5 3.5-3.5S8 8 8 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    ${escHtml(participants)}
                </div>
            </div>
            <div class="meeting-actions">
                <button class="btn-join-meeting ${isLive ? 'now' : ''}" onclick="startCall('${meeting.internIds[0] || '1'}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    Join
                </button>
                <button class="btn-meeting-edit" onclick="openEditMeeting('${meeting.id}')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                ${currentUser.role === 'manager' || meeting.organizer === myId ? `
                <button class="btn-meeting-cancel" onclick="cancelMeeting('${meeting.id}')" title="Cancel Meeting">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>` : ''}
            </div>
        `;
        list.appendChild(card);
    });
}

function highlightMeeting(id) {
    const el = document.getElementById('meeting-'+id);
    if (el) {
        el.scrollIntoView({behavior:'smooth', block:'nearest'});
        el.style.borderColor = 'var(--red-primary)';
        setTimeout(() => el.style.borderColor = '', 1500);
    }
}

function deleteMeeting(id) {
    meetings = meetings.filter(m => m.id !== id);
    save();
    renderCalendar();
    document.getElementById('meetingCount').textContent = meetings.length;
}

// ── Schedule Meeting Modal ────────────────────────
function openScheduleModal(prefillDate) {
    const modal = document.getElementById('scheduleMeetingModal');
    modal.classList.remove('hidden');
    document.getElementById('meetingTitle').value = '';
    document.getElementById('meetingNotes').value = '';
    document.getElementById('meetingDate').value  = prefillDate || todayStr();
    document.getElementById('meetingTime').value  = '09:00';
    document.getElementById('meetingDuration').value = '30';

    // Render participant chips
    const sel = document.getElementById('participantSelector');
    sel.innerHTML = '';
    interns.forEach(intern => {
        const chip = document.createElement('div');
        chip.className = 'participant-chip';
        chip.dataset.id = intern.id;
        chip.innerHTML = `<div class="p-avatar" style="background:${avatarColor(intern.id)}">${initials(intern.name)}</div>${intern.name}`;
        chip.addEventListener('click', () => chip.classList.toggle('selected'));
        sel.appendChild(chip);
    });

    setTimeout(() => document.getElementById('meetingTitle').focus(), 50);
}

function closeScheduleModal() {
    document.getElementById('scheduleMeetingModal').classList.add('hidden');
}

function saveMeeting() {
    const title    = document.getElementById('meetingTitle').value.trim();
    const date     = document.getElementById('meetingDate').value;
    const time     = document.getElementById('meetingTime').value;
    const duration = document.getElementById('meetingDuration').value;
    const notes    = document.getElementById('meetingNotes').value.trim();
    const internIds = Array.from(document.querySelectorAll('.participant-chip.selected')).map(c => c.dataset.id);

    if (!title) { shakeInput('meetingTitle'); return; }
    if (!date)  { shakeInput('meetingDate');  return; }

    if (window.editingMeetingId) {
        const idx = meetings.findIndex(m => m.id === window.editingMeetingId);
        if (idx !== -1) {
            meetings[idx] = { ...meetings[idx], title, date, time, duration: parseInt(duration), notes, internIds };
        }
        window.editingMeetingId = null;
    } else {
        meetings.push({
            id: 'meet' + ts(),
            title, date, time, 
            duration: parseInt(duration), 
            notes, internIds,
            organizer: currentUser.internId || MANAGER_ID
        });
    }

    save();
    closeScheduleModal();
    renderUpcomingMeetings();
    renderCalendar();
}

// ══════════════════════════════════════════════════
// AUTH / LOGIN MODULE
// ══════════════════════════════════════════════════

function populateLoginDropdown() {
    const select = document.getElementById('loginUserSelect');
    if (!select) return;
    // Keep only the placeholder and Manager option
    select.innerHTML = `
        <option value="" disabled selected>Choose your account…</option>
        <option value="manager">👔 Manager</option>
    `;
    interns.forEach(intern => {
        const opt = document.createElement('option');
        opt.value = intern.id;
        opt.textContent = `${initials(intern.name)} ${intern.name} — ${intern.role}`;
        select.appendChild(opt);
    });
}

function createParticles() {
    const container = document.getElementById('loginParticles');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'login-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = (Math.random() * 6) + 's';
        p.style.animationDuration = (4 + Math.random() * 4) + 's';
        if (Math.random() > 0.5) p.style.background = 'var(--blue)';
        if (Math.random() > 0.7) p.style.background = 'var(--purple)';
        p.style.width = (2 + Math.random() * 4) + 'px';
        p.style.height = p.style.width;
        container.appendChild(p);
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.add('hidden');
    createParticles();
    populateLoginDropdown();
    setTimeout(() => document.getElementById('loginUserSelect').focus(), 100);
}

function hideLoginScreen() {
    document.getElementById('loginScreen').classList.add('hidden');
}

function attemptLogin() {
    const userId   = document.getElementById('loginUserSelect').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl  = document.getElementById('loginError');
    const errorMsg = document.getElementById('loginErrorMsg');

    if (!userId) {
        errorMsg.textContent = 'Please select a user';
        errorEl.classList.remove('hidden');
        return;
    }

    if (!password) {
        errorMsg.textContent = 'Please enter your password';
        errorEl.classList.remove('hidden');
        return;
    }

    const storedPass = credentials[userId];
    if (password !== storedPass) {
        errorMsg.textContent = 'Invalid password. Please try again.';
        errorEl.classList.remove('hidden');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
        return;
    }

    // Successful login
    errorEl.classList.add('hidden');
    if (userId === 'manager') {
        currentUser = { role: 'manager', internId: null, name: MANAGER_NAME };
    } else {
        const intern = getIntern(userId);
        currentUser = { role: 'intern', internId: userId, name: intern ? intern.name : 'Intern' };
    }

    sessionStorage.setItem('am_session', JSON.stringify(currentUser));
    hideLoginScreen();
    initApp();
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('am_session');
    document.body.classList.remove('intern-mode');
    selectedInternId = null;
    activeChatInternId = null;
    clearInterval(clockIntervalId);

    // Reset dashboard to empty state
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('internDashboard').classList.add('hidden');

    showLoginScreen();
}

// ══════════════════════════════════════════════════
// ROLE-BASED UI SCOPING
// ══════════════════════════════════════════════════

function applyRoleScoping() {
    updateUserPill();

    if (currentUser.role === 'manager') {
        document.body.classList.remove('intern-mode');
        renderSidebar();
        // Auto-select first intern
        if (interns.length > 0) setTimeout(() => selectIntern(interns[0].id), 80);
    } else {
        document.body.classList.add('intern-mode');
        renderInternSidebar();
        // Auto-select the logged-in intern's own dashboard
        setTimeout(() => selectIntern(currentUser.internId), 80);
    }
}

function renderInternSidebar() {
    const intern = getIntern(currentUser.internId);
    if (!intern) return;
    const list = document.getElementById('internList');
    const count = document.getElementById('internCount');
    count.textContent = '1';
    document.querySelector('.sidebar-header h3').textContent = 'My Workspace';

    list.innerHTML = '';
    // Profile card
    const card = document.createElement('li');
    card.innerHTML = `
        <div class="intern-profile-card">
            <div class="intern-profile-avatar" style="background:${avatarColor(intern.id)}">${initials(intern.name)}</div>
            <div class="intern-profile-name">${intern.name}</div>
            <div class="intern-profile-role">${intern.role}</div>
            <div class="intern-profile-status status-badge" data-status="${intern.status}">
                <span class="status-dot"></span>
                ${capitalise(intern.status)}
            </div>
        </div>
    `;
    list.appendChild(card);
}

function updateUserPill() {
    const avatarEl = document.getElementById('userPillAvatar');
    const nameEl   = document.getElementById('userPillName');

    if (currentUser.role === 'manager') {
        avatarEl.textContent = 'M';
        avatarEl.style.background = 'linear-gradient(135deg, var(--red-primary), var(--red-light))';
        nameEl.textContent = 'Manager';
    } else {
        const intern = getIntern(currentUser.internId);
        if (intern) {
            avatarEl.textContent = initials(intern.name);
            avatarEl.style.background = avatarColor(intern.id);
            nameEl.textContent = intern.name;
        }
    }
}

// Overrides merged into main bodies above. Cleanup complete.
function wireEvents() {
    // View tabs
    document.getElementById('viewTabs').addEventListener('click', e => {
        const tab = e.target.closest('.view-tab');
        if (tab) switchView(tab.dataset.view);
    });

    // Add intern
    document.getElementById('btnAddIntern').addEventListener('click', openModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('btnCancelModal').addEventListener('click', closeModal);
    document.getElementById('btnConfirmAdd').addEventListener('click', addIntern);
    document.getElementById('addInternModal').addEventListener('click', e => { if (e.target===e.currentTarget) closeModal(); });
    ['internName','internRole','internEmail'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key==='Enter') addIntern();
            if (e.key==='Escape') closeModal();
        });
    });

    // Dashboard actions
    document.getElementById('btnClockIn').addEventListener('click', toggleClock);
    document.getElementById('btnStatus').addEventListener('click', cycleStatus);
    document.getElementById('btnVideoCall').addEventListener('click', () => { if (selectedInternId) startCall(selectedInternId); });
    document.getElementById('btnOpenChat').addEventListener('click', () => { if (selectedInternId) openChatFor(selectedInternId); });

    // Task filters & add
    document.getElementById('taskFilters').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) setTaskFilter(btn.dataset.filter);
    });
    document.getElementById('btnTaskAdd').addEventListener('click', () => {
        addTask(document.getElementById('taskInput').value, document.getElementById('taskPriority').value);
        document.getElementById('taskInput').value = '';
        document.getElementById('taskInput').focus();
    });
    document.getElementById('taskInput').addEventListener('keydown', e => {
        if (e.key==='Enter') { addTask(e.target.value, document.getElementById('taskPriority').value); e.target.value=''; }
    });

    // Note add
    document.getElementById('btnNoteAdd').addEventListener('click', () => {
        const text = document.getElementById('noteInput').value.trim();
        if (!text) return;
        const intern = getIntern(selectedInternId);
        if (!intern) return;
        logActivity(intern, 'note', `Manager note: ${text}`);
        save();
        renderActivity(intern);
        updateActivityScore(intern);
        document.getElementById('noteInput').value = '';
    });
    document.getElementById('noteInput').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('btnNoteAdd').click(); });

    // Search
    document.getElementById('searchInput').addEventListener('input', e => renderSidebar(e.target.value));

    // Chat
    document.getElementById('btnSend').addEventListener('click', () => {
        const input = document.getElementById('chatInput');
        sendMessage(input.value);
        input.value = '';
        input.focus();
    });
    document.getElementById('chatInput').addEventListener('keydown', e => {
        if (e.key==='Enter' && !e.shiftKey) {
            const input = e.target;
            sendMessage(input.value);
            input.value = '';
        }
    });

    // Emoji picker (simple popover)
    document.getElementById('btnEmoji').addEventListener('click', () => {
        const existing = document.getElementById('emojiPopover');
        if (existing) { existing.remove(); return; }
        const pop = document.createElement('div');
        pop.id = 'emojiPopover';
        pop.style.cssText = 'position:absolute;bottom:70px;left:16px;background:var(--bg-elevated);border:1px solid var(--border-light);border-radius:10px;padding:8px;display:flex;gap:6px;z-index:300;box-shadow:var(--shadow-lg)';
        EMOJIS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.textContent = emoji;
            btn.style.cssText = 'background:none;border:none;font-size:1.3rem;cursor:pointer;transition:transform 0.15s;border-radius:4px;padding:2px 4px';
            btn.addEventListener('mouseover', () => btn.style.transform='scale(1.25)');
            btn.addEventListener('mouseout',  () => btn.style.transform='');
            btn.addEventListener('click', () => {
                const inp = document.getElementById('chatInput');
                inp.value += emoji;
                inp.focus();
                pop.remove();
            });
            pop.appendChild(btn);
        });
        const chatInputRow = document.querySelector('.chat-input-row');
        chatInputRow.style.position = 'relative';
        chatInputRow.appendChild(pop);
        setTimeout(() => document.addEventListener('click', function handler(e) {
            if (!pop.contains(e.target) && e.target.id !== 'btnEmoji') { pop.remove(); document.removeEventListener('click', handler); }
        }), 10);
    });

    // Video call controls
    document.getElementById('btnToggleMute').addEventListener('click', toggleMute);
    document.getElementById('btnToggleCamera').addEventListener('click', toggleCamera);
    document.getElementById('btnScreenShare').addEventListener('click', toggleScreenShare);
    document.getElementById('btnEndCall').addEventListener('click', endCall);

    // Calendar nav
    document.getElementById('calPrev').addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth=11; calYear--; }
        drawCalendar(calYear, calMonth);
    });
    document.getElementById('calNext').addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth=0; calYear++; }
        drawCalendar(calYear, calMonth);
    });
    document.getElementById('btnScheduleMeeting').addEventListener('click', () => openScheduleModal());
    document.getElementById('meetingModalClose').addEventListener('click', closeScheduleModal);
    document.getElementById('btnCancelMeeting').addEventListener('click', closeScheduleModal);
    document.getElementById('btnConfirmMeeting').addEventListener('click', saveMeeting);
    document.getElementById('scheduleMeetingModal').addEventListener('click', e => { if (e.target===e.currentTarget) closeScheduleModal(); });
    document.getElementById('meetingTitle').addEventListener('keydown', e => { if(e.key==='Enter') saveMeeting(); if(e.key==='Escape') closeScheduleModal(); });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', logout);

    // Login form
    document.getElementById('loginSubmit').addEventListener('click', attemptLogin);
    document.getElementById('loginPassword').addEventListener('keydown', e => {
        if (e.key === 'Enter') attemptLogin();
    });
    document.getElementById('loginUserSelect').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('loginPassword').focus();
    });
    // Password eye toggle
    document.getElementById('loginEyeBtn').addEventListener('click', () => {
        const inp = document.getElementById('loginPassword');
        inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    // Clear error when user changes selection
    document.getElementById('loginUserSelect').addEventListener('change', () => {
        document.getElementById('loginError').classList.add('hidden');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
    });

    // Global Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal();
            closeScheduleModal();
            endCall();
        }
    });

    // Hover on task delete
    document.addEventListener('mouseover', e => { const b=e.target.closest('.task-delete'); if(b) b.style.color='var(--red-light)'; });
    document.addEventListener('mouseout',  e => { const b=e.target.closest('.task-delete'); if(b) b.style.color='var(--text-muted)'; });
}

// ══════════════════════════════════════════════════
// APP INIT (called after successful login)
// ══════════════════════════════════════════════════
function initApp() {
    migrateChatData();
    renderSidebar();
    updateChatTabBadge();
    applyRoleScoping();
}

// ══════════════════════════════════════════════════
// INIT — entry point
// ══════════════════════════════════════════════════
function init() {
    startTopbarClock();
    seedIfEmpty();
    wireEvents();

    // Check for existing session
    const savedSession = sessionStorage.getItem('am_session');
    if (savedSession) {
        try {
            currentUser = JSON.parse(savedSession);
            hideLoginScreen();
            initApp();
        } catch(e) {
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

document.addEventListener('DOMContentLoaded', init);
