// =========================================================
// client.js: 최종 클라이언트 코드 (공지사항 바 세로 확장 레이아웃 개선)
// =========================================================

// 서버와 연결
const socket = io();

// HTML 요소 정의
const form = document.getElementById('chat-form');
const input = document.getElementById('msg');
const messages = document.getElementById('messages');
const dateBtn = document.getElementById('date-btn');
const announcementBar = document.getElementById('announcement-bar');

// 캘린더 관련 요소 정의
const calendarToggleBtn = document.getElementById('calendar-toggle-btn');
const scheduleModal = document.getElementById('schedule-modal');
const calendarView = document.getElementById('calendar-view');
const closeBtn = document.querySelector('#schedule-modal .close-btn');

// 캘린더 Grid 관련 요소 
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const currentMonthYear = document.getElementById('current-month-year');
const calendarGridBody = document.querySelector('#calendar-grid tbody');

// 캘린더 관련 상태 변수
let currentDateForCalendar = new Date(); 
// isCalendarView = true: 캘린더 Grid 뷰, false: 프로젝트/과제 뷰 
let isCalendarView = true; 

// ----------------------------
// [0] 사용자 상태 변수 및 초기화
// ----------------------------
let currentUserId = null;
let currentUsername = 'Guest'; 
let currentRoomCode = null;
const TEMP_PASSWORD = 'testpassword'; 

/**
 * 메시지를 화면에 출력하는 유틸리티 함수 (줄 바꿈 및 HTML 포맷팅 지원 추가)
 */
function addMessage(msg, isSelf = false, isSystem = false) {
    const li = document.createElement('li');
    li.classList.add('message-item');

    // 1. 줄 바꿈 문자(\n)를 HTML <br> 태그로 변환
    // 이 처리가 줄 바꿈이 안 되던 문제를 해결합니다.
    const formattedMsg = msg.replace(/\n/g, '<br>');

    // 2. innerHTML을 사용하여 HTML 태그(예: <br>, 마크다운의 **)를 적용
    li.innerHTML = formattedMsg;
    if (isSystem) {
        li.classList.add('system');
        // 시스템 메시지는 내용이 길 경우 자동으로 줄 바꿈이 되도록 스타일 추가
        li.style.whiteSpace = 'pre-wrap';
    } else if (isSelf) {
        li.classList.add('self');
    } else {
        li.classList.add('other');
    }
    
    // messages 변수는 전역적으로 정의되어 있어야 합니다.
    // (예: const messages = document.getElementById('messages');)
    if (typeof messages !== 'undefined' && messages) {
        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight;
    } else {
        console.error("메시지 컨테이너 요소 (messages)를 찾을 수 없습니다.");
    }
}

/**
 * 대화 내역을 서버로부터 불러와 화면에 출력합니다.
 */
async function loadChatHistory(roomCode) {
    try {
        const res = await fetch(`/api/messages/history?room=${roomCode}`);
        const data = await res.json();

        if (data.success && data.messages) {
            messages.innerHTML = '';
            data.messages.forEach(msg => {
                const isSelf = msg.senderId === currentUserId;
                const senderName = isSelf ? '나' : msg.username;
                
                addMessage(`${senderName}: ${msg.content}`, isSelf, false);
            });
            addMessage(`📜 방 [${roomCode}] 이전 대화 ${data.messages.length}개를 불러왔습니다.`, false, true);
        }
    } catch (error) {
        addMessage(`❌ 대화 내역을 불러오는 데 실패했습니다.`, false, true);
    }
}

// ----------------------------------------------------
// 과제완료 명령어 처리 함수
// ----------------------------------------------------
async function handleTaskCompletionCommand(message, currentRoomCode) {
    // !과제완료 프로젝트명, 과제명
    const parts = message.substring("!과제완료".length).trim();
    // 쉼표(,)를 기준으로 나누고, 공백 제거
    const [projectName, taskTitle] = parts.split(',').map(s => s.trim());
    if (!projectName || !taskTitle) {
        return `[명령어 오류] 올바른 형식으로 입력해주세요: !과제완료 프로젝트명, 과제명`;
    }

    try {
        const response = await fetch('/api/completeTask', { // 👈 서버 API 엔드포인트
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                room: currentRoomCode,
                projectName: projectName,
                taskTitle: taskTitle,
                status: 'COMPLETED' // 진행률 필드(progress: 100) 대신 상태 전송
            }),
        });

        const result = await response.json();
        if (response.ok && result.success) {
            // 성공 시 사이드바 업데이트 및 모달 뷰 새로고침
            if (typeof loadSchedules === 'function') {
                 loadSchedules();
            }
            // 프로젝트/과제 뷰가 열려있으면 즉시 업데이트
            if (scheduleModal.style.display === 'block' && !isCalendarView) {
                renderProjectTaskView();
            }
            // 서버 응답의 필드(projectName, taskTitle) 사용
            return `[과제 완료 알림] 프로젝트 '${result.projectName}'의 과제 '${result.taskTitle}'를 (완료) 상태로 변경했습니다.`;
        } else {
            // 실패 시 서버 메시지 반환
            return `[과제 완료 실패] ${result.message || '과제 완료 중 오류가 발생했습니다. (일치하는 과제가 없거나 서버 오류)'}`;
        }
    } catch (error) {
        console.error('Task completion failed:', error);
        return `[시스템 오류] 서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`;
    }
}
// ----------------------------------------------------
// ----------------------------------------------------

/**
 * 서버에서 프로젝트 목록을 불러와 시스템 메시지 형태로 채팅창에 출력합니다.
 */
async function renderProjectListAsMessage() {
    if (!currentRoomCode) return;
    try {
        const res = await fetch(`/api/projects?room=${currentRoomCode}`);
        const data = await res.json();
        if (data.success && data.projects) {
            const projects = data.projects;
            if (projects.length === 0) {
                addMessage(`📢 현재 등록된 프로젝트가 없습니다. 명령어: !프로젝트 [이름]`, false, true);
                return;
            }
            
            let messageContent = `🏗️ **프로젝트 현황 (${currentRoomCode})** (총 ${projects.length}개)\n`;
            projects.forEach((project, index) => {
                const status = project.status === 'COMPLETED' ? '✅ 완료' : '🚧 진행중';
                messageContent += `\n**[${index + 1}] ${project.name}** (${status})\n`;
                // 프로젝트의 전체 진행률은 서버 데이터 그대로 사용
                messageContent += `   - **진행률:** ${project.progress}%\n`; 
                
                if (project.tasks && project.tasks.length > 0) {
                    messageContent += `   - **주요 과제 (${project.tasks.length}개):**\n`;
                    project.tasks.slice(0, 3).forEach(task => { // 최대 3개만 표시
                        const statusKor = task.status === 'COMPLETED' ? '완료' : '진행중';
                        // 개별 과제는 진행률 대신 상태 표시
                        messageContent += `     - ${task.title} (상태: **${statusKor}**) (담당: ${task.username || '미정'})\n`;
                    });
                    if (project.tasks.length > 3) {
                         messageContent += `     ... 외 ${project.tasks.length - 3}개\n`;
                    }
                } else {
                    messageContent += `   - 등록된 과제가 없습니다.`;
                }
            });
            addMessage(messageContent, false, true); 
        } else {
            addMessage(`❌ 프로젝트 목록 로드 실패: ${data.message || '알 수 없는 오류'}`, false, true);
        }
    } catch (error) {
        addMessage(`❌ 프로젝트 목록을 불러오는 중 네트워크 오류 발생.`, false, true);
    }
}


/**
 * 일정 수동 삭제 처리 (loadSchedules를 재호출하여 뷰 업데이트)
 */
async function deleteSchedule(scheduleId) {
    if (!confirm('정말로 이 일정을 삭제하시겠습니까?')) {
        return;
    }

    try {
        const res = await fetch(`/api/schedules/${scheduleId}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (data.success) {
            console.log(`[일정 삭제 성공] ID: ${scheduleId}`);
            // 서버에서도 시스템 메시지로 알림을 보내지만, 클라이언트에서 바로 업데이트를 위해 호출
            loadSchedules();
        } else {
            console.log(`[일정 삭제 실패] ${data.message}`);
        }
    } catch (error) {
        console.log(`[일정 삭제 중 오류] 네트워크 오류가 발생했습니다.`);
    }
}


/**
 * 캘린더 모달 열기/닫기
 */
function toggleScheduleModal(show) {
    scheduleModal.style.display = show ? 'block' : 'none';
}

/**
 * 캘린더 Grid 뷰를 렌더링하는 함수 
 */
function renderCalendar(schedules = []) {
    // 프로젝트 뷰 숨기기
    const existingProjectView = calendarView.querySelector('.project-task-view');
    if(existingProjectView) existingProjectView.style.display = 'none';
    // 일정 목록 뷰 숨기기
    const existingListView = calendarView.querySelector('.schedule-list-view');
    if(existingListView) existingListView.style.display = 'none';
    // 캘린더 요소 표시
    const controls = document.querySelector('.calendar-controls');
    if (controls) controls.style.display = 'flex';
    const calendarGridEl = document.getElementById('calendar-grid');
    if (calendarGridEl) calendarGridEl.style.display = 'table';
    if (calendarGridBody) calendarGridBody.innerHTML = ''; 


    const year = currentDateForCalendar.getFullYear();
    const month = currentDateForCalendar.getMonth();
    if (currentMonthYear) currentMonthYear.textContent = `${year}년 ${month + 1}월`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let date = 1;
    let week = document.createElement('tr');
    const schedulesByDay = {};
    schedules.forEach(schedule => {
        const eventDate = new Date(schedule.startTime);
        if (eventDate.getFullYear() === year && eventDate.getMonth() === month) {
            const dayKey = eventDate.getDate(); 
            if (!schedulesByDay[dayKey]) {
                schedulesByDay[dayKey] = [];
            }
            schedulesByDay[dayKey].push(schedule);
        }
    });
    for (let i = 0; i < firstDayOfMonth; i++) {
        week.appendChild(document.createElement('td'));
    }

    while (date <= daysInMonth) {
        if (week.children.length === 7) {
            if (calendarGridBody) calendarGridBody.appendChild(week);
            week = document.createElement('tr');
        }

        const cell = document.createElement('td');
        cell.classList.add('calendar-day');
        
        const dateElement = document.createElement('div');
        dateElement.classList.add('date-number');
        dateElement.textContent = date;
        cell.appendChild(dateElement);
        
        const today = new Date();
        if (date === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }

        if (schedulesByDay[date]) {
            schedulesByDay[date].forEach(schedule => {
                const event = document.createElement('div');
                event.classList.add('schedule-event');
                event.style.backgroundColor = schedule.color;
                
                const eventTime = new Date(schedule.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                event.title = `[${eventTime}] ${schedule.title}`;
                
                const eventTextSpan = document.createElement('span');
                eventTextSpan.textContent = schedule.title.substring(0, 5) + (schedule.title.length > 5 ? '..' : '');

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'x';
                deleteButton.classList.add('delete-schedule-btn');
                deleteButton.setAttribute('onclick', `deleteSchedule('${schedule._id}')`);
                event.appendChild(eventTextSpan);
                event.appendChild(deleteButton); 

                cell.appendChild(event);
            });
        }

        cell.dataset.date = date; 
        week.appendChild(cell);
        date++;
    }

    while (week.children.length < 7) {
        week.appendChild(document.createElement('td'));
    }
    if (calendarGridBody) calendarGridBody.appendChild(week);
    
    // 버튼 텍스트 업데이트 로직은 loadSchedules로 이동하여 통일합니다.
}

/**
 * 목록 List 뷰를 렌더링하는 함수 
 */
function renderListView(schedules = []) {
    // 프로젝트 뷰 숨기기
    const existingProjectView = calendarView.querySelector('.project-task-view');
    if(existingProjectView) existingProjectView.style.display = 'none';
    // 캘린더 Grid 요소 숨기기
    const controls = document.querySelector('.calendar-controls');
    if (controls) controls.style.display = 'none';
    const calendarGridEl = document.getElementById('calendar-grid');
    if (calendarGridEl) calendarGridEl.style.display = 'none';
    // 캘린더 Grid 뷰가 사용하던 tbody를 비움
    if (calendarGridBody) calendarGridBody.innerHTML = '';
    // List 뷰 컨테이너 찾기 또는 새로 생성
    let listViewEl = calendarView.querySelector('.schedule-list-view');
    if (!listViewEl) {
        listViewEl = document.createElement('div');
        listViewEl.classList.add('schedule-list-view');
        calendarView.appendChild(listViewEl);
    }
    listViewEl.style.display = 'block'; // List 뷰 표시
    
    let listHtml = `
        <div class="list-header">
            <h4>📄 예정된 일정 목록 (List) 뷰</h4>
        </div>
    `;
    if (schedules.length > 0) {
        const listItems = schedules.map(schedule => {
            const date = new Date(schedule.startTime);
            const formattedTime = date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', year: 'numeric' }) 
                                     + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const itemStyle = `border-left: 5px solid ${schedule.color};`;
            
            return `<li style="${itemStyle}">[${formattedTime}] ${schedule.title} <button onclick="deleteSchedule('${schedule._id}')" class="delete-schedule-btn">x</button></li>`;
        }).join('');
        listHtml += `
            <h4>총 ${schedules.length}개의 예정된 일정이 등록되어 있습니다.</h4>
            <ul class="schedule-list">${listItems}</ul>
        `;
    } else {
        listHtml += `<p>📢 방 [${currentRoomCode}]에 등록된 예정된 일정이 없습니다.</p>`;
    }

    // List 뷰 컨테이너에 HTML 삽입
    listViewEl.innerHTML = listHtml;
    // 버튼 텍스트 업데이트 로직은 loadSchedules로 이동하여 통일합니다.
}

/**
 * 🚀 프로젝트/과제 List 뷰를 렌더링하는 함수 
 */
async function renderProjectTaskView() {
    // 캘린더/일정 목록 요소 숨기기
    const controls = document.querySelector('.calendar-controls');
    if (controls) controls.style.display = 'none';
    const calendarGridEl = document.getElementById('calendar-grid');
    if (calendarGridEl) calendarGridEl.style.display = 'none';
    const existingListView = calendarView.querySelector('.schedule-list-view');
    if(existingListView) existingListView.style.display = 'none';

    // 1. 서버에서 데이터 로드
    let projects;
    try {
        const res = await fetch(`/api/projects?room=${currentRoomCode}`);
        const data = await res.json();
        if (data.success) {
            projects = data.projects;
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        let projectTaskEl = calendarView.querySelector('.project-task-view');
        if (!projectTaskEl) {
            projectTaskEl = document.createElement('div');
            projectTaskEl.classList.add('project-task-view');
            calendarView.appendChild(projectTaskEl);
        }
        projectTaskEl.style.display = 'block';
        // 프로젝트 뷰 표시
        projectTaskEl.innerHTML = `<p>❌ 프로젝트/과제 로드 실패: ${error.message}</p>`;
        return;
    }

    // 2. 뷰 컨테이너 준비
    let projectTaskEl = calendarView.querySelector('.project-task-view');
    if (!projectTaskEl) {
        projectTaskEl = document.createElement('div');
        projectTaskEl.classList.add('project-task-view');
        calendarView.appendChild(projectTaskEl);
    }
    projectTaskEl.style.display = 'block'; // 프로젝트 뷰 표시
    projectTaskEl.innerHTML = '';
    // 기존 내용 초기화

    let html = '<h4>🏗️ 프로젝트 및 과제 현황</h4>';
    if (projects.length === 0) {
        html += '<p>📢 현재 등록된 프로젝트가 없습니다. 명령어: **!프로젝트 [이름]**</p>';
    } else {
        projects.forEach(project => {
            // 프로젝트 카드 시작
            const progressColor = project.progress === 100 ? '#4CAF50' : '#FF9800';
            const statusIcon = project.status === 'COMPLETED' ? '✅' : '🚧';
            
            html += `
                <div class="project-card" style="border: 1px solid #444; background-color: #222; margin-bottom: 15px; padding: 15px; border-radius: 8px;">
                    <div class="project-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: #FFF; font-size: 1.1em;">${statusIcon} ${project.name}</h5>
                        <span style="font-weight: bold; color: ${progressColor};">${project.progress}% (${project.tasks.length}개 과제)</span>
                    </div>
                    
                    <div class="progress-bar-container" style="width: 100%; background-color: #333; border-radius: 5px; height: 10px; margin-bottom: 10px;">
                        <div class="progress-bar" style="width: ${project.progress}%; background-color: ${progressColor}; height: 10px; border-radius: 5px;"></div>
                    </div>

                    <ul class="task-list" style="list-style-type: none; padding-left: 0; margin-top: 10px; font-size: 14px;">
            `;

            if (project.tasks && project.tasks.length > 0) {
                html += '<h5>📜 과제 목록:</h5>';
                project.tasks.forEach(task => {
                    // 개별 과제의 진행률 대신 상태를 사용
                    const isCompleted = task.status === 'COMPLETED'; 
                    const taskStatusIcon = isCompleted ? '✅' : '➡️';
                    const taskColor = isCompleted ? '#8BC34A' : '#CFD8DC'; // 완료는 초록, 나머지는 회색 계열
                    const statusKor = isCompleted ? '완료' : '진행중';

                    html += `
                        <li style="margin-top: 5px; border-left: 3px solid ${taskColor}; padding: 5px 10px; background-color: #333; border-radius: 4px; color: #EEE;">
                            ${taskStatusIcon} <b>${task.title}</b> 
                            <span style="float: right; color: #B3E5FC;">담당: ${task.username || task.senderId} (상태: ${statusKor})</span>
                        </li>
                    `;
                });
            } else {
                // !과제 명령어 형식에서 진행률 옵션 제거 반영
                html += '<li>등록된 과제가 없습니다. 명령어: **!과제 [프로젝트명], [제목], [담당자], [완료/진행중(선택)]**</li>';
            }
            
            // 프로젝트 카드 종료
            html += `
                    </ul>
                </div>
            `;
        });
    }
    projectTaskEl.innerHTML = html;
    
    // 버튼 텍스트 업데이트 로직은 loadSchedules로 이동하여 통일합니다.
}


/**
 * 일정 조회, 뷰 업데이트, 그리고 공지사항 업데이트 함수
 * 공지사항 바에 가장 가까운 일정과 모든 프로젝트 요약을 표시합니다.
 */
async function loadSchedules() {
    if (!currentRoomCode) {
        calendarView.innerHTML = '<p>채팅방에 참가해야 일정을 볼 수 있습니다.</p>';
        return;
    }
    
    // 1. 공지사항 바 업데이트를 위한 데이터 로드
    let closestScheduleAnnouncementHtml = '';
    let schedules = [];
    let projectSummaryAnnouncementHtml = '';

    // A. 일정 데이터 로드 및 가장 가까운 일정 HTML 생성 
    try {
        const scheduleRes = await fetch(`/api/schedules?room=${currentRoomCode}`);
        if (scheduleRes.ok) {
            const data = await scheduleRes.json();
            schedules = data.schedules || [];
            
            if (schedules.length > 0) {
                const now = new Date();
                const closestSchedule = schedules
                    .filter(s => new Date(s.startTime).getTime() > now.getTime())
                    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0];
                if (closestSchedule) {
                    const startTime = new Date(closestSchedule.startTime);
                    const month = (startTime.getMonth() + 1).toString().padStart(2, '0');
                    const day = startTime.getDate().toString().padStart(2, '0');
                    const timeString = startTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                    
                    const combinedDateTime = `${month}월${day}일 ${timeString}`;
                    closestScheduleAnnouncementHtml = 
                        `<div class="schedule-announcement" style="background-color: #FFEB3B; color: #333; padding: 5px 10px; display: flex; align-items: center; font-size: 14px; line-height: 1.2; font-weight: bold; flex-shrink: 0; width: 100%; box-sizing: border-box; margin-bottom: 5px;">
                            <span style="margin-right: 5px;">다음 일정:</span>
                            <span style="margin-right: 5px; color: #D32F2F;">[${combinedDateTime}]</span>
                            <span>${closestSchedule.title.substring(0, 15)}${closestSchedule.title.length > 15 ? '..' : ''}</span>
                        </div>`;
                }
            }
        }
    } catch (e) { 
          closestScheduleAnnouncementHtml = 
            `<div class="schedule-announcement" style="padding: 5px 10px; font-size: 14px; color: #f00;">
                ❌ 일정 로드 오류.
            </div>`;
    }

   // B. 프로젝트 데이터 로드 및 요약 HTML 생성 
    try {
        const projectRes = await fetch(`/api/projects?room=${currentRoomCode}`);
        const projectData = await projectRes.json();
        
        if (projectData.success && projectData.projects && projectData.projects.length > 0) {
            let projects = projectData.projects;

            // 🛠️ 누락된 수정 사항 1: 클라이언트 측 프로젝트 진행률 재계산 로직을 제거합니다.
            // 서버에서 project.progress를 계산하여 제공합니다.
            // (이전 코드의 projects = projects.map(p => { ... }) 블록 제거)
            
            // 🚀 상태 텍스트를 변환하는 헬퍼 함수
            const getStatusText = (status) => {
                switch(status) {
                    case 'COMPLETED':
                        return '완료';
                    case 'IN_PROGRESS':
                    default:
                        return '진행중';
                }
            };

            // 프로젝트와 하위 과제를 포함하는 HTML을 생성합니다.
            const projectSummaries = projects.map(p => {
                const statusIcon = p.status === 'COMPLETED' ? '✅' : '🚧';
                
                // 1. 과제 목록 HTML 생성
                let taskListHtml = '';
                if (p.tasks && p.tasks.length > 0) {
                    const tasksToShow = p.tasks.slice(0, 3);
                    
                   taskListHtml = tasksToShow.map(task => {
                        // 개별 과제는 진행률(task.progress) 대신 상태를 사용
                        const taskStatusIcon = task.status === 'COMPLETED' ? '✅' : '➡️';
                        const taskName = task.title.substring(0, 10) + (task.title.length > 10 ? '..' : '');
                        
                        // 과제 상태 표시
                        const statusText = getStatusText(task.status);
                        
                        // 🌟 추가: 담당자 이름(task.username)을 가져오고 미정인 경우 '미정'으로 설정
                        const taskUsername = task.username || '미정';

                        // 🌟 수정: 반환 HTML에 담당자 정보 추가
                        return `<div style="font-size: 11px; margin-left: 15px; color: #BBB;">${taskStatusIcon} ${taskName} (${taskUsername}) (${statusText})</div>`;
                    }).join('');

                    if (p.tasks.length > 3) {
                        taskListHtml += `<div style="font-size: 11px; margin-left: 15px; color: #888;">... 외 ${p.tasks.length - 3}개</div>`;
                    }
                } else {
                    taskListHtml = `<div style="font-size: 11px; margin-left: 15px; color: #888;">(등록된 과제 없음)</div>`;
                }

                // 2. 프로젝트 이름과 과제 목록을 결합
                // 프로젝트 진행률은 서버 데이터를 그대로 사용합니다.
                return `
                    <div style="margin: 5px 0;">
                        <p style="margin: 0; padding: 1px 0; font-weight: 500;">
                            ${statusIcon} ${p.name.substring(0, 12)}${p.name.length > 12 ? '..' : ''} (${p.progress}%)
                        </p>
                        ${taskListHtml}
                    </div>
                `;
            }).join('');
            
            // 최종 프로젝트 요약 HTML 컨테이너
            projectSummaryAnnouncementHtml = `<div class="project-announcement" style="flex-grow: 1; font-size: 14px; padding: 5px 10px; border-top: 1px solid #ddd; margin-top: 5px; width: 100%; box-sizing: border-box;">
                <span style="font-weight: bold; color: #555; display: block; margin-bottom: 3px;">🏗️ 프로젝트 (${projects.length}개):</span>
                ${projectSummaries}
            </div>`;
        } else {
            projectSummaryAnnouncementHtml = `<div class="project-announcement" style="font-size: 14px; color: #777; padding: 5px 10px; width: 100%; box-sizing: border-box;">
                🏗️ 등록된 프로젝트 없음.
            </div>`;
        }
    } catch (error) {
        projectSummaryAnnouncementHtml = `<div class="project-announcement" style="font-size: 14px; color: #f00; padding: 5px 10px; width: 100%; box-sizing: border-box;">
            ❌ 프로젝트 목록 로드 오류.
        </div>`;
    }

    // 3. 공지사항 바 업데이트
    if (announcementBar) {
        announcementBar.innerHTML = closestScheduleAnnouncementHtml + projectSummaryAnnouncementHtml;
    }
    
    // 4. 모달 뷰 업데이트
    if (scheduleModal.style.display === 'block') {
        if (isCalendarView) {
            renderCalendar(schedules);
        } else {
            renderProjectTaskView();
        }
    }
    
    // 5. 토글 버튼 텍스트 업데이트
    const toggleBtn = document.getElementById('calendar-toggle-btn');
    if (toggleBtn) {
        // 버튼 텍스트를 두 줄로 설정 (모달이 열렸을 때/닫혔을 때 모두 적용)
        const buttonHtml = '🗓️ 일정/프로젝트 보기(클릭)';
        if (scheduleModal.style.display === 'block') {
            // 모달이 열려 있을 때
            toggleBtn.innerHTML = buttonHtml;
        } else {
            // 모달이 닫혀 있을 때
            toggleBtn.innerHTML = buttonHtml;
        }
    }
}

function initializeUser() {
    const username = prompt("사용자 이름(ID)을 입력하세요.");
    if (!username) {
        addMessage(`❌ 사용자 이름을 입력해야 채팅을 이용할 수 있습니다.`, false, true);
        return;
    }
    const roomCode = prompt("참가할 채팅방 코드를 입력하세요 (예: FANTASY, G3S2)");
    if (!roomCode) {
        addMessage(`❌ 방 코드를 입력해야 채팅에 참가할 수 있습니다.`, false, true);
        return;
    }
    currentRoomCode = roomCode;
    // 로그인 시도 (TEMP_PASSWORD 사용)
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username, password: TEMP_PASSWORD })
    })
    .then(res => res.json())
    .then(async data => {
        if (data.success) {
            currentUserId = data.userId;
            currentUsername = data.username;
            socket.emit('join room', currentRoomCode);
            await loadChatHistory(currentRoomCode);
            // 프로젝트 목록을 불러와 메시지 창에 출력
            await renderProjectListAsMessage();
            isCalendarView = true; // 초기 뷰 설정
            loadSchedules();
        } else {
            // 로그인 실패 시, 등록 시도
            fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: username, password: TEMP_PASSWORD })
            })
            .then(res => res.json())
            .then(async regData => {
                if (regData.success) {
                    currentUserId = regData.userId;
                    currentUsername = username;
                    socket.emit('join room', currentRoomCode);
                    await loadChatHistory(currentRoomCode);
                    // 프로젝트 목록을 불러와 메시지 창에 출력
                    await renderProjectListAsMessage();
                    isCalendarView = true; // 초기 뷰 설정
                    loadSchedules();
                } else {
                    addMessage(`❌ 로그인/등록 실패: ${regData.message}`, false, true);
                }
            });
        }
    })
    .catch(err => addMessage(`❌ 인증 요청 중 네트워크 오류가 발생했습니다.`, false, true));
}

initializeUser();

// ----------------------------
// [1] 이벤트 리스너 설정
// ----------------------------
form.addEventListener('submit', async (e) => { // async 추가
    e.preventDefault();
    let msg = input.value;
    // 입력 값 정제: NFKC 정규화 및 trim 처리
    msg = msg.replace(/[\r\n]/g, '').trim();
    if (msg.normalize) {
        msg = msg.normalize('NFKC');
    }
    // ⭐ 중요: 전송이 안되는 문제 해결을 위해 currentUserId, currentRoomCode가 
    // initializeUser() 함수 내에서 비동기로 설정될 수 있으므로, 여기서도 확인
    if (!msg || !currentUserId || !currentRoomCode) {
        return;
    }

    // basePayload는 일반 메시지 전송용으로만 사용하거나,
    // 명령 전송 시에는 text 필드를 가진 새로운 객체를 생성합니다.
    const basePayload = { roomCode: currentRoomCode, senderId: currentUserId, username: currentUsername };
    
    // --- 명령어 처리 로직 (순서 변경 및 !명령어 추가) ---
    
    // ⭐ 1. !명령어 처리
    if (msg.startsWith('!명령어')) {
        addMessage(`[명령어 목록 요청]: ${msg}`, true, false);
        handleCommandList(); // 클라이언트 유틸리티 함수 호출
    
    // 2. !과제완료 처리 (API 호출)
    } else if (msg.startsWith('!과제완료')) { // 🚀 신규 명령어 처리
        addMessage(`[과제 완료 명령어 처리]: ${msg}`, true, false);
        // 과제 완료 처리 함수 호출 및 결과 메시지 수신
        const commandResponse = await handleTaskCompletionCommand(msg, currentRoomCode);
        // 시스템 메시지로 응답 출력
        addMessage(commandResponse, false, true);
    
    // 3. !일정 처리 (Socket.IO)
    } else if (msg.startsWith('!일정')) {
        // 🌟 수정: text 필드에 msg를 담아 전송
        socket.emit('add_schedule_command', { ...basePayload, text: msg });
        addMessage(`[일정 명령어 전송]: ${msg}`, true, false);
        
    // 4. !프로젝트 처리 (Socket.IO)
    } else if (msg.startsWith('!프로젝트')) {
        // 🌟 수정: text 필드에 msg를 담아 전송
        socket.emit('add_project_command', { ...basePayload, text: msg });
        addMessage(`[프로젝트 명령어 전송]: ${msg}`, true, false);
        
    // 5. !과제 처리 (Socket.IO)
    } else if (msg.startsWith('!과제')) {
        // 🌟 수정: text 필드에 msg를 담아 전송
        socket.emit('add_task_command', { ...basePayload, text: msg });
        addMessage(`[과제 명령어 전송]: ${msg}`, true, false);
    
    } else {
        // 일반 메시지
        const messagePayload = { content: msg, senderId: currentUserId, username: currentUsername, roomCode: currentRoomCode };
        addMessage(`${currentUsername}: ${msg}`, true, false);
        socket.emit('chat message', messagePayload);
    }

    input.value = '';
});

// 일정 보기 버튼(calendarToggleBtn) 클릭 이벤트: 모달 토글 및 뷰 전환
if (calendarToggleBtn && scheduleModal) {
    calendarToggleBtn.addEventListener('click', () => {
        
        // [A] 모달이 닫혀 있으면 모달을 열고 캘린더 뷰(Grid)로 시작
        if (scheduleModal.style.display === 'none' || scheduleModal.style.display === '') {
            isCalendarView = true; // 최초 열림은 캘린더 뷰 (Grid)로 시작
            scheduleModal.style.display = 'block'; // 🌟 모달 열기 (toggleScheduleModal 대체)

            // 캘린더 뷰일 때 현재 달로 초기화 (Grid 뷰를 위해)
            currentDateForCalendar = new Date();
            currentDateForCalendar.setDate(1);

            // 버튼 텍스트 업데이트
            calendarToggleBtn.innerHTML = '🗓️ 일정/캘린더 닫기 (클릭)';

        } else {
            // [B] 모달이 열려 있을 경우, 뷰 순환: 캘린더(true) -> 프로젝트(false)
            isCalendarView = !isCalendarView;

            // 캘린더 뷰로 돌아갈 때만 현재 달로 초기화
            if (isCalendarView) { 
                currentDateForCalendar = new Date();
                currentDateForCalendar.setDate(1);
            }
            // *참고: 모달이 이미 열려 있으므로 닫지 않고 뷰만 전환합니다.*
            
            // 뷰 전환 시 버튼 텍스트는 모달이 닫힐 때만 "보기"로 바뀌어야 하므로, 여기서는 변경하지 않습니다.
        }

        // 뷰 상태(isCalendarView)가 바뀌었으므로, 바뀐 상태에 따라 일정을 로드/렌더링
        loadSchedules();
    });
}


// ----------------------------------------------------------------------
// 💡 모달 닫기 버튼(X) 로직도 확인하세요 (버튼 텍스트 복원)
// ----------------------------------------------------------------------

// 모달 닫기 버튼(X) 클릭 이벤트
if (closeBtn && scheduleModal) {
    closeBtn.addEventListener('click', () => {
        scheduleModal.style.display = 'none';
        
        // 모달을 닫을 때 버튼 텍스트도 원래대로 복원
        if (calendarToggleBtn) {
            calendarToggleBtn.innerHTML = '🗓️ 일정/캘린더 보기 (클릭)'; 
        }
    });
}

// 월 이동 버튼 이벤트 리스너 추가 (캘린더 뷰일 때만 동작)
if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        // isCalendarView가 true일 때만 캘린더 이동
        if (isCalendarView) {
            currentDateForCalendar.setMonth(currentDateForCalendar.getMonth() - 1);
            loadSchedules();
        }
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        // isCalendarView가 true일 때만 캘린더 이동
        if (isCalendarView) {
            currentDateForCalendar.setMonth(currentDateForCalendar.getMonth() + 1);
            loadSchedules();
        }
    });
}

// 모달 닫기 버튼
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        toggleScheduleModal(false);
    });
}

// 모달 외부 클릭 시 닫기
window.addEventListener('click', (event) => {
    if (event.target === scheduleModal) {
        toggleScheduleModal(false);
    }
});

// 날짜 버튼 클릭
dateBtn.addEventListener('click', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = (now.getDate() + 1).toString().padStart(2, '0'); // 내일 날짜
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    
    // 입력 필드에 일정 명령어 템플릿 삽입 (ISO 형식에 가까운 포맷으로 제공)
    const commandText = `!일정 제목, ${year}${month}${day}, ${hour}:${minute}, #607D8B`;
    input.value = commandText;
    input.focus();
    input.setSelectionRange('!일정 제목,'.length, '!일정 제목,'.length + 3); // 제목 부분 선택
});

// ----------------------------
// [2] 서버로부터 수신
// ----------------------------

// 채팅 메시지 수신
socket.on('chat message', (data) => {
    if (data.senderId !== currentUserId) { 
        addMessage(`${data.username}: ${data.content}`, false, false);
    }
});

// 시스템 메시지 수신
socket.on('system message', (msg) => {
    console.log(`[System Message] 📥 Received Server Response: ${msg}`);
    
    addMessage(msg, false, true); 

    // 일정 및 프로젝트/과제 저장 성공/삭제 성공 시 뷰 새로고침
    if (msg.includes('일정') || msg.includes('프로젝트') || msg.includes('과제')) {
        // 공지 바 업데이트 (필수)
        loadSchedules(); 
        
        // 모달 뷰 업데이트 (모달이 열려 있을 때만)
        if (scheduleModal.style.display === 'block') {
            // isCalendarView가 true이고 (일정/삭제 메시지) 일 때 캘린더/리스트 뷰 업데이트
            if (isCalendarView && (msg.includes('일정') || msg.includes('삭제'))) {
                loadSchedules(); // loadSchedules 내부에서 renderCalendar 호출됨
            // isCalendarView가 false이고 (프로젝트/과제 메시지) 일 때 프로젝트/과제 뷰 업데이트
            } else if (!isCalendarView && (msg.includes('프로젝트') || msg.includes('과제'))) {
                renderProjectTaskView();
            }
        }
        
        // 프로젝트/과제 명령어로 인해 데이터가 변경되면 메시지 목록에도 새로고침하여 출력
        if (msg.includes('프로젝트') && msg.includes('성공')) {
            renderProjectListAsMessage();
        }
    }
});
function handleCommandList() {
    const commands = getCommandList();
    
    // 1. 컨테이너: text-align: left; 유지
    let commandListHtml = `
        <div style="background-color: #333; padding: 10px; border-radius: 5px; margin-top: 10px; color: #EEE; text-align: left;">
            <h1 style="margin-top: 0; color: #00BCD4; margin-bottom: 0;">사용 가능한 명령어 목록</h1>
    `;

    let contentHtml = '';
    
    commands.forEach((cmd, index) => {
        // 4. 각 명령어 묶음을 <p> 태그로 감싸고, 마진을 0으로 설정하여 <br> 외에 추가적인 줄 간격 제거
        contentHtml += `<p style="margin: 0;">`;
        
        // 명령어 형식 (굵은 글씨, 색상 적용)
        contentHtml += `<b style="color: #FFC107;">${cmd.command}</b>: <span style="font-style: italic;">${cmd.format}</span><br>`;
        
        // 설명 (다음 줄에 표시)
        contentHtml += `<span style="font-size: 0.9em; color: #BDBDBD;">${cmd.description}</span>`;
        
        contentHtml += `</p>`;
        
        // 5. 항목 간에 명시적인 줄 바꿈 1개만 추가하여 한 줄만 띄우기
        if (index < commands.length - 1) {
            contentHtml += `<br>`;
        }
    });

    commandListHtml += contentHtml;
    commandListHtml += `
        </div>
    `;

    addMessage(commandListHtml, false, true);
}

function getCommandList() {
    return [
        { 
            command: "!명령어", 
            format: "!명령어", 
            description: "사용 가능한 모든 명령어 목록을 확인합니다." 
        },
        { 
            command: "!일정", 
            // 🛠️ 수정: 서버 로직에 맞춰 날짜/시간 형식을 '내일/모레/YYYYMMDD, HH:MM'으로 변경
            format: "!일정 [제목], [내일/모레/YYYYMMDD], [HH:MM], [색상(선택)]", 
            description: "새로운 일정을 등록합니다." 
        },
        { 
            command: "!프로젝트", 
            format: "!프로젝트 [프로젝트명]", 
            description: "새 프로젝트를 등록하거나 기존 프로젝트를 조회합니다." 
        },
        { 
            command: "!과제", 
            // 🛠️ 수정: 진행률(0-100) 옵션 제거, '완료/진행중' 상태만 남김
            format: "!과제 [프로젝트명], [과제 제목], [담당자], [완료/진행중(선택)]", 
            description: "프로젝트에 과제를 추가/수정합니다." 
        },
        { 
            command: "!과제완료", 
            format: "!과제완료 [프로젝트명], [과제 제목]", 
            // 🛠️ 수정: 진행률 대신 '완료' 상태로 변경됨을 명시
            description: "특정 과제의 상태를 '완료'로 변경합니다." 
        }
        // 다른 명령어 항목들은 필요에 따라 추가
    ];
}