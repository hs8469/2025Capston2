// =========================================================
// server.js: MongoDB Atlas 연결 적용 및 스키마/로직 수정 통합 (오류 수정 완료)
// =========================================================
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static('public')); 

// --- [0] MongoDB 연결 설정 ---
const MONGO_URI = "mongodb+srv://User:1234@kimhs.kylelzp.mongodb.net/chat_scheduler_db?appName=kimhs";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Atlas 연결 성공'))
    .catch(err => console.error('MongoDB Atlas 연결 실패:', err));

// --- [1] MongoDB 스키마 및 모델 정의 ---

// 사용자 스키마
const UserSchema = new mongoose.Schema({
    userId: { type: String, default: uuidv4, required: true, unique: true }, 
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

// 메시지 스키마
const MessageSchema = new mongoose.Schema({
    roomCode: { type: String, required: true },
    senderId: { type: String, required: true },
    username: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});

// 일정 스키마
const ScheduleSchema = new mongoose.Schema({
    roomCode: { type: String, required: true },
    senderId: { type: String, required: true },
    title: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    color: { type: String, default: '#607D8B' }
});

// 과제 (Task) 스키마 - Project 내부에 포함될 예정
const TaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    // progress 필드 삭제
    status: { type: String, default: 'IN_PROGRESS', enum: ['IN_PROGRESS', 'COMPLETED'] }, // 오직 완료(COMPLETED) 또는 진행중(IN_PROGRESS)만 사용
    username: { type: String }, // 과제 담당자
    senderId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});


// 프로젝트 스키마 (Task를 포함)
const ProjectSchema = new mongoose.Schema({
    roomCode: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, default: 'IN_PROGRESS', enum: ['IN_PROGRESS', 'COMPLETED'] }, 
    progress: { type: Number, default: 0, min: 0, max: 100 }, // 프로젝트 전체 평균 진행률 (유지)
    tasks: [TaskSchema], // 과제 목록을 배열로 포함
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Schedule = mongoose.model('Schedule', ScheduleSchema);
const Project = mongoose.model('Project', ProjectSchema);


/**
 * 프로젝트의 전체 진행률과 상태를 재계산하는 헬퍼 함수
 * @param {object} project - MongoDB Project 문서 객체
 * // 🛠️ 변경: 과제 상태(COMPLETED) 기준으로 진행률 재계산
 */
function recalculateProjectProgress(project) {
    if (project.tasks.length === 0) {
        project.progress = 0;
        project.status = 'IN_PROGRESS';
        return;
    }

    // 1. 완료된 과제 수 계산
    const completedTasks = project.tasks.filter(t => t.status === 'COMPLETED').length;
    const totalTasks = project.tasks.length;
    
    // 2. 전체 진행률 계산 (완료된 과제 수 / 전체 과제 수)
    project.progress = Math.round((completedTasks / totalTasks) * 100);
    
    // 3. 프로젝트 상태 결정 (모든 과제가 완료되면 프로젝트 완료)
    const allTasksCompleted = completedTasks === totalTasks;
    project.status = allTasksCompleted ? 'COMPLETED' : 'IN_PROGRESS';
}


// --- [2] Express API 라우트 ---

// 1. 사용자 등록 (생략)
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: '사용자 등록 성공', userId: newUser.userId, username: newUser.username });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ success: false, message: '등록 실패: 사용자명이 이미 존재합니다.' });
        } else {
            console.error(error);
            res.status(500).json({ success: false, message: '등록 중 서버 오류가 발생했습니다.' });
        }
    }
});

// 2. 사용자 로그인 (생략)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, message: '로그인 실패: 사용자명을 찾을 수 없습니다.' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            res.json({ success: true, message: '로그인 성공', userId: user.userId, username: user.username });
        } else {
            res.status(401).json({ success: false, message: '로그인 실패: 비밀번호가 일치하지 않습니다.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '로그인 중 서버 오류' });
    }
});

// 3. 채팅 내역 로드 (생략)
app.get('/api/messages/history', async (req, res) => {
    const { room } = req.query;
    try {
        const messages = await Message.find({ roomCode: room })
            .sort({ timestamp: 1 })
            .limit(50);
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: '대화 내역 로드 실패' });
    }
});

// 4. 일정 내역 로드 (생략)
app.get('/api/schedules', async (req, res) => {
    const { room } = req.query;
    try {
        const schedules = await Schedule.find({ roomCode: room, startTime: { $gte: new Date() } })
            .sort({ startTime: 1 });
        res.json({ success: true, schedules });
    } catch (error) {
        res.status(500).json({ success: false, message: '일정 로드 실패' });
    }
});

// 5. 일정 삭제 (생략)
app.delete('/api/schedules/:id', async (req, res) => {
    try {
        const result = await Schedule.findByIdAndDelete(req.params.id);
        if (result) {
            res.json({ success: true, message: '일정 삭제 성공' });
        } else {
            res.status(404).json({ success: false, message: '해당 일정을 찾을 수 없습니다.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: '일정 삭제 중 오류' });
    }
});

// 6. 프로젝트 및 과제 목록 로드 (생략)
app.get('/api/projects', async (req, res) => {
    try {
        const { room } = req.query;
        if (!room) {
            return res.status(400).json({ success: false, message: '방 코드가 필요합니다.' });
        }
        
        const projects = await Project.find({ roomCode: room }).sort({ name: 1 });
        
        const result = projects.map(project => project.toObject());
        
        res.json({ success: true, projects: result });
    } catch (error) {
        console.error("Project API Error:", error);
        res.status(500).json({ success: false, message: '프로젝트/과제 로드 실패', error: error.message });
    }
});

// 🌟 7. 과제 완료 처리 API (클라이언트의 !과제완료 명령어 처리)
app.post('/api/completeTask', async (req, res) => {
    const { room, projectName, taskTitle } = req.body;
    
    if (!room || !projectName || !taskTitle) {
        return res.status(400).json({ success: false, message: '방 코드, 프로젝트명, 과제명을 모두 입력해야 합니다.' });
    }

    try {
        const project = await Project.findOne({ 
            roomCode: room, 
            name: projectName 
        });

        if (!project) {
            return res.status(404).json({ success: false, message: `프로젝트 '${projectName}'을(를) 찾을 수 없습니다.` });
        }

        // 과제 배열에서 해당 제목의 과제 찾기
        const task = project.tasks.find(t => t.title === taskTitle);
        
        if (!task) {
            return res.status(404).json({ success: false, message: `프로젝트 '${projectName}' 내에서 과제 '${taskTitle}'을(를) 찾을 수 없습니다.` });
        }

        // 🛠️ 변경: 과제 상태를 'COMPLETED'로 변경 (progress 필드 없음)
        task.status = 'COMPLETED';
        task.updatedAt = new Date();
        
        // 프로젝트의 전체 진행률과 상태를 재계산
        recalculateProjectProgress(project);
        
        await project.save(); // 데이터베이스에 저장

        // Socket.IO를 사용하여 해당 방에 알림 메시지 발송
        io.to(room).emit('system message', `✅ 프로젝트 [**${projectName}**]의 과제 [**${taskTitle}**]이 완료되었습니다! (프로젝트 진행률: ${project.progress}%)`);

        res.json({ 
            success: true, 
            message: '과제 완료 처리 성공',
            projectName: projectName, 
            taskTitle: taskTitle 
        });
    } catch (error) {
        console.error('Task completion error:', error);
        res.status(500).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
    }
});


// --- [3] Socket.IO 이벤트 핸들러 ---
io.on('connection', (socket) => {
    console.log('새로운 사용자 연결됨');

    // 1. 채팅방 참가 (생략)
    socket.on('join room', (roomCode) => {
        socket.join(roomCode);
        console.log(`사용자 ${socket.id}가 방 ${roomCode}에 참가했습니다.`);
        socket.emit('system message', `🎉 방 [${roomCode}]에 참가했습니다.`);
    });

    // 2. 일반 채팅 메시지 수신 및 전파 (생략)
    socket.on('chat message', async (data) => {
        const { content, senderId, username, roomCode } = data;
        const newMessage = new Message({ roomCode, senderId, username, content });
        await newMessage.save();
        io.to(roomCode).emit('chat message', data);
    });

    // 3. 일정 명령어 수신 및 처리 (수정된 부분)
socket.on('add_schedule_command', async (data) => {
    const { roomCode, senderId, username, text } = data;
    
    // 🌟 오류 수정 부분: text가 없거나 유효하지 않은 경우 즉시 종료 및 오류 메시지 전송
    if (!text || typeof text !== 'string' || !text.startsWith('!일정')) {
        console.error('❌ 일정 명령어 데이터 오류: text 속성이 누락되거나 유효하지 않습니다.', data);
        const errorMessage = `❌ 일정 명령어 데이터 오류: 명령어가 올바르게 전송되지 않았습니다. 올바른 형식: !일정 [제목], [내일/모레/YYYYMMDD], [HH:MM], [색상(선택)]`;
        return socket.emit('system message', errorMessage);
    }
    
    // 명령어 파싱
    const parts = text.substring('!일정'.length).split(',').map(p => p.trim());
    
    // 제목, 날짜, 시간은 필수 (3개 이상)
    if (parts.length < 3) {
        const errorMessage = `❌ 일정 명령어 오류: 제목, 날짜(내일/모레/YYYYMMDD), 시간을 모두 입력해주세요. (예시: !일정 회의, 내일, 10:00)`;
        return socket.emit('system message', errorMessage);
    }

    const title = parts[0];
    const dateRaw = parts[1]; // 날짜: '내일', '모레', '20251230'
    const timeRaw = parts[2]; // 시간: '22:28'
    const color = parts.length > 3 ? parts[3] : '#607D8B'; // 색상 (선택)
    
    try {
        let dateObj = new Date(); // 현재 시각으로 초기화
        dateObj.setSeconds(0, 0); // 초, 밀리초 초기화

        // 1. 날짜 파싱 로직
        if (dateRaw === '내일') {
            dateObj.setDate(dateObj.getDate() + 1); // 내일로 설정
        } else if (dateRaw === '모레') {
            dateObj.setDate(dateObj.getDate() + 2); // 모레로 설정
        } else if (/^\d{8}$/.test(dateRaw)) {
            // YYYYMMDD 형식 파싱
            const year = parseInt(dateRaw.substring(0, 4));
            const month = parseInt(dateRaw.substring(4, 6)) - 1; // 월은 0부터 시작
            const day = parseInt(dateRaw.substring(6, 8));
            
            // 유효성 검사 및 설정
            dateObj.setFullYear(year, month, day);
        } else {
            return socket.emit('system message', `❌ 일정 등록 실패: 유효하지 않은 날짜 형식입니다. (내일, 모레, YYYYMMDD 중 선택)`);
        }
        
        // 2. 시간 파싱 로직 (HH:MM)
        const timeParts = timeRaw.split(':');
        if (timeParts.length !== 2 || isNaN(parseInt(timeParts[0])) || isNaN(parseInt(timeParts[1]))) {
            return socket.emit('system message', `❌ 일정 등록 실패: 유효하지 않은 시간 형식입니다. (HH:MM 형식 사용)`);
        }
        
        const hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);

        // 시간, 분 설정
        dateObj.setHours(hours, minutes, 0, 0); 

        // 3. Date 객체 최종 확인 및 저장
        const startTime = dateObj;
        if (isNaN(startTime.getTime())) { // 최종적으로 유효하지 않은 날짜인 경우
            return socket.emit('system message', '❌ 일정 등록 실패: 유효하지 않은 날짜/시간 형식입니다. 날짜를 확인해주세요.');
        }

        const newSchedule = new Schedule({
            roomCode,
            senderId,
            title,
            startTime,
            color 
        });
        await newSchedule.save();
        
        const successMessage = `✅ 일정 저장 성공: [${title}] ${startTime.toLocaleString('ko-KR')} (by ${username})`;
        io.to(roomCode).emit('system message', successMessage);
        
    } catch (error) {
        console.error('❌ 일정 저장 중 서버 오류:', error);
        socket.emit('system message', `❌ 일정 저장 중 서버 오류가 발생했습니다: ${error.message}`);
    }
});

    // 4. 프로젝트 등록/업데이트 명령어 처리 
    socket.on('add_project_command', async (data) => {
        const { roomCode, username, text } = data;
        
        // 🌟 프로젝트 명령어에도 방어적 코드 추가
        if (!text || typeof text !== 'string' || !text.startsWith('!프로젝트')) {
            return socket.emit('system message', '❌ 프로젝트명 오류: 프로젝트 이름을 입력해주세요. (예시: !프로젝트 캡스톤 최종)');
        }
        
        const projectName = text.substring('!프로젝트'.length).trim();
        
        if (!projectName) {
            return socket.emit('system message', '❌ 프로젝트명 오류: 프로젝트 이름을 입력해주세요. (예시: !프로젝트 캡스톤 최종)');
        }

        try {
            let project = await Project.findOne({ roomCode, name: projectName });

            if (project) {
                const updateMessage = `🔄 프로젝트 업데이트: [${projectName}] (이미 등록된 프로젝트입니다.)`;
                io.to(roomCode).emit('system message', updateMessage);
            } else {
                const newProject = new Project({ roomCode, name: projectName });
                await newProject.save();
                
                const createMessage = `✅ 프로젝트 등록 성공: [${projectName}]이(가) 등록되었습니다. (by ${username})`;
                io.to(roomCode).emit('system message', createMessage);
            }
        } catch (error) {
            console.error('❌ 프로젝트 저장 중 서버 오류:', error);
            socket.emit('system message', '❌ 프로젝트 처리 중 서버 오류가 발생했습니다.');
        }
    });
    
    // 5. 과제 등록/업데이트 명령어 처리 
    socket.on('add_task_command', async ({ roomCode, senderId, username, text }) => {
        
        // 🌟 과제 명령어에도 방어적 코드 추가
        if (!text || typeof text !== 'string' || !text.startsWith('!과제')) {
            return io.to(roomCode).emit('system message', `❌ [과제] 명령어 형식이 잘못되었습니다. 올바른 형식: !과제 [프로젝트명], [과제 제목], [담당자], [완료/진행중(선택)]`);
        }
        
        const commandText = text.substring('!과제'.length).trim();
        const parts = commandText.split(',').map(p => p.trim()); 

        // 필수 입력 항목 3개: 프로젝트명, 과제 제목, 담당자
        if (parts.length < 3) {
            // 🛠️ 변경: 진행률 언급 삭제
            io.to(roomCode).emit('system message', `❌ [과제] 명령어 형식이 잘못되었습니다. 올바른 형식: !과제 [프로젝트명], [과제 제목], [담당자], [완료/진행중(선택)]`);
            return;
        }

        const projectName = parts[0];
        const taskTitle = parts[1];
        const assigneeName = parts[2]; // 담당자 이름
        
        // 상태 입력 처리: '완료'가 입력되면 'COMPLETED', 아니면 'IN_PROGRESS'
        const statusInput = (parts[3] || '진행중').toLowerCase(); 

        let status = 'IN_PROGRESS';

        // 🛠️ 변경: 진행률(숫자) 처리 로직 삭제
        if (statusInput === '완료') {
            status = 'COMPLETED';
        } 
        // '진행중' 또는 다른 텍스트는 기본값 'IN_PROGRESS' 유지

        try {
            const project = await Project.findOne({ roomCode, name: projectName });

            if (!project) {
                io.to(roomCode).emit('system message', `❌ [과제] 프로젝트 '**${projectName}**'을(를) 찾을 수 없습니다.`);
                return;
            }
            
            // 1. 기존 과제 검색 및 업데이트
            const existingTask = project.tasks.find(t => t.title === taskTitle);
            
            if (existingTask) {
                // 담당자, 상태 업데이트
                existingTask.username = assigneeName; 
                existingTask.status = status;
                existingTask.updatedAt = new Date();
                
                // 프로젝트 진행률 다시 계산
                recalculateProjectProgress(project);
                
                await project.save();
                const statusKor = status === 'COMPLETED' ? '완료' : '진행중';
                // 🛠️ 변경: 개별 과제 진행률 언급 삭제
                io.to(roomCode).emit('system message', 
                    `✅ [과제] '**${projectName}**' 프로젝트의 과제 '**${taskTitle}**'(담당자: ${assigneeName})을(를) **${statusKor}**으로 수정 완료! (프로젝트 진행률: ${project.progress}%)`
                );
                
            } else {
                // 2. 새 과제 생성 및 추가
                project.tasks.push({
                    title: taskTitle,
                    status: status,
                    username: assigneeName, // 담당자 이름 사용
                    senderId: senderId
                });
                
                // 프로젝트 진행률 다시 계산
                recalculateProjectProgress(project);
                
                await project.save();
                const statusKor = status === 'COMPLETED' ? '완료' : '진행중';
                // 🛠️ 변경: 개별 과제 진행률 언급 삭제
                io.to(roomCode).emit('system message', 
                    `✅ [과제] 프로젝트 '**${projectName}**'에 새로운 과제 '**${taskTitle}**'(담당자: ${assigneeName}, 상태: **${statusKor}**) 추가 성공! (프로젝트 진행률: ${project.progress}%)`
                );
            }

        } catch (error) {
            console.error('Error adding/modifying task:', error);
            // 오류 메시지를 사용자에게 명확하게 전달하도록 수정
            io.to(roomCode).emit('system message', `❌ [과제] 과제 추가/수정 중 서버 오류가 발생했습니다: ${error.message}`);
        }
    });

    // 6. 연결 해제 (생략)
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제됨');
    });
});


// --- [4] 서버 시작 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});