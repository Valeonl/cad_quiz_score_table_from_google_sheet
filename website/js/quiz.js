/**
 * Квиз ЦАД — JavaScript для отображения результатов
 * Данные загружаются из Google Sheets
 */

// Конфигурация Google Sheets
const CONFIG = {
    spreadsheetId: '1J0MtysCf-ipbylRTXPf9CNlKz1M1jj6BguFr7_CU7Xc',
    range: 'A1:Z1000',
    questionsRange: 'вопросы!A1:C1000', // Лист с вопросами
    teamsRange: 'команды!A1:A100', // Лист с командами
    apiKey: 'AIzaSyB8eMVab-8cvE997P-gbWlArrWmw4QjtwE',
    autoRefreshInterval: 5000, // 5 секунд
    totalRounds: 6 // Всего раундов
};

// Глобальное состояние
let quizData = [];
let questionsData = {}; // Словарь вопросов: ключ "раунд-номер вопроса" -> описание
let teamsList = []; // Список всех команд
let currentRound = 'all';
let autoRefreshEnabled = true;
let autoRefreshTimer = null;
let progressChart = null;
let distributionChart = null;

// ========================================
// Инициализация
// ========================================
$(document).ready(function() {
    initEventListeners();
    startAutoRefresh();
    loadAllData();
    
    // Принудительное обновление таблицы для правильного определения мобильной версии
    setTimeout(function() {
        updateResultsTable();
    }, 100);
});

// ========================================
// Обработчики событий
// ========================================
function initEventListeners() {
    // Кнопка обновления
    $('#refreshBtn').on('click', function() {
        loadAllData(true);
    });

    // Переключатель автообновления
    $('#autoRefresh').on('change', function() {
        autoRefreshEnabled = this.checked;
        if (autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    // Вкладки раундов
    $('.round-tab').on('click', function() {
        const round = $(this).data('round');
        switchRound(round);
    });

    // Обновление таблицы при изменении размера окна
    let resizeTimer;
    $(window).on('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            updateResultsTable();
        }, 250);
    });

    // Обработчик клика на вопрос (мобильная версия)
    $(document).on('click', '.question-col.clickable', function() {
        const questionText = $(this).data('question');
        const questionNum = $(this).data('num');
        const round = $(this).data('round');

        if (questionText && questionText !== '') {
            $('#modalQuestionNum').text(`${round}-${questionNum}`);
            $('#modalQuestionText').text(questionText);
            $('#questionModal').modal('show');
        }
    });
}

// ========================================
// Автообновление
// ========================================
function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(function() {
        if (autoRefreshEnabled && document.visibilityState === 'visible') {
            loadAllData(false);
        }
    }, CONFIG.autoRefreshInterval);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

// ========================================
// Загрузка всех данных (результаты + вопросы + команды)
// ========================================
async function loadAllData(showLoading = false) {
    const $refreshBtn = $('#refreshBtn');
    const $statusDot = $('.status-dot');
    const $statusText = $('.status-text');

    // Показываем анимацию
    $refreshBtn.addClass('spinning');
    $statusDot.removeClass('connected error');
    $statusText.text('Загрузка...');

    try {
        // Загружаем данные из всех листов параллельно
        const [scoresResponse, questionsResponse, teamsResponse] = await Promise.all([
            fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${CONFIG.range}?key=${CONFIG.apiKey}`
            ),
            fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${CONFIG.questionsRange}?key=${CONFIG.apiKey}`
            ),
            fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${CONFIG.teamsRange}?key=${CONFIG.apiKey}`
            )
        ]);

        if (!scoresResponse.ok) {
            throw new Error(`HTTP error! status: ${scoresResponse.status}`);
        }
        if (!questionsResponse.ok) {
            throw new Error(`HTTP error! status: ${questionsResponse.status}`);
        }
        if (!teamsResponse.ok) {
            throw new Error(`HTTP error! status: ${teamsResponse.status}`);
        }

        const scoresData = await scoresResponse.json();
        const questionsDataRaw = await questionsResponse.json();
        const teamsDataRaw = await teamsResponse.json();

        if (!scoresData.values || scoresData.values.length === 0) {
            throw new Error('Данные результатов отсутствуют');
        }

        // Парсим команды
        teamsList = parseTeamsData(teamsDataRaw.values || []);

        // Парсим вопросы
        questionsData = parseQuestionsData(questionsDataRaw.values || []);

        // Парсим результаты и дополняем нулями
        const rawQuizData = parseQuizData(scoresData.values);
        quizData = generateFullData(rawQuizData, teamsList);

        // Обновляем UI
        updateLeadersTable();
        updateResultsTable();
        updateCharts();
        updateLastUpdateTime();

        // Успех
        $statusDot.addClass('connected');
        $statusText.text('Подключено');

    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        $statusDot.addClass('error');
        $statusText.text('Ошибка подключения');
    } finally {
        $refreshBtn.removeClass('spinning');
    }
}

// ========================================
// Парсинг команд из листа "команды"
// ========================================
function parseTeamsData(rows) {
    const teams = [];
    // Структура: Команда (столбец A)
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0] || row[0].toString().trim() === '') continue;
        
        // Пропускаем заголовок
        if (i === 0 && row[0].toString().toLowerCase().includes('команда')) continue;
        
        teams.push(row[0].toString().trim());
    }
    return teams;
}

// ========================================
// Генерация полных данных с нулями для всех команд и раундов
// ========================================
function generateFullData(rawData, teams) {
    const fullData = [];
    
    // Просто копируем все существующие данные
    // Команды будут отображаться с 0 если нет данных
    rawData.forEach(row => {
        fullData.push(row);
    });
    
    return fullData;
}

// ========================================
// Парсинг вопросов из листа "вопросы"
// ========================================
function parseQuestionsData(rows) {
    const questions = {};
    // Структура: Номер раунда | Номер вопроса | Описание вопроса
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) continue;

        const round = parseInt(row[0]) || 0;
        const questionNum = parseInt(row[1]) || 0;
        const description = row[2] || '';

        const key = `${round}-${questionNum}`;
        questions[key] = description;
    }
    return questions;
}

// ========================================
// Парсинг данных из Google Sheets
// ========================================
function parseQuizData(rows) {
    // Структура столбцов:
    // A: Команда, B: Номер раунда, C: Название раунда, D: Номер вопроса в раунде, E: Текст вопроса, F: Полученные баллы
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || !row[0]) continue;

        const team = row[0] || '';                    // Команда
        const round = parseInt(row[1]) || 0;          // Номер раунда
        const roundName = row[2] || '';               // Название раунда
        const questionNum = parseInt(row[3]) || 0;    // Номер вопроса в раунде
        const question = row[4] || '';                // Текст вопроса
        const score = parseFloat(row[5]) || 0;        // Полученные баллы (столбец F, индекс 5)

        data.push({
            team,
            round,
            roundName,
            questionNum,
            question,
            score
        });
    }

    return data;
}

// ========================================
// Обновление таблицы лидеров
// ========================================
function updateLeadersTable() {
    const $tbody = $('#leadersTable tbody');
    $tbody.empty();

    // Считаем общий счёт по командам из quizData
    const teamScores = {};
    quizData.forEach(row => {
        if (!teamScores[row.team]) {
            teamScores[row.team] = 0;
        }
        teamScores[row.team] += row.score;
    });

    // Добавляем команды из списка, которых нет в данных (с 0 баллов)
    teamsList.forEach(team => {
        if (!teamScores[team]) {
            teamScores[team] = 0;
        }
    });

    // Сортируем команды по счёту
    const sortedTeams = Object.entries(teamScores)
        .sort((a, b) => b[1] - a[1])
        .map(([team, score], index) => ({ rank: index + 1, team, score }));

    // Отображаем топ команд
    sortedTeams.forEach((item, index) => {
        const rankClass = item.rank <= 3 ? `rank-${item.rank}` : '';
        const rankIcon = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank;

        const $tr = $(`
            <tr>
                <td class="rank-col ${rankClass}">${rankIcon}</td>
                <td class="team-col">${escapeHtml(item.team)}</td>
                <td class="score-col">${item.score}</td>
            </tr>
        `);

        $tr.css('animation-delay', `${index * 0.1}s`);
        $tbody.append($tr);
    });
}

// ========================================
// Обновление таблицы результатов
// ========================================
function updateResultsTable() {
    const $tbody = $('#resultsTable tbody');
    $tbody.empty();

    // Фильтруем по раунду
    let filteredData = quizData;
    if (currentRound !== 'all') {
        filteredData = quizData.filter(row => row.round === parseInt(currentRound));
    }

    // Если это конкретный раунд, показываем все команды с результатами или "нет данных"
    if (currentRound !== 'all') {
        const roundNum = parseInt(currentRound);
        const isMobile = $(window).width() <= 768;
        
        // Для каждого раунда показываем все команды
        teamsList.forEach(team => {
            const teamData = filteredData.filter(row => row.team === team);
            
            if (teamData.length === 0) {
                // Нет данных для этой команды в этом раунде
                const questionText = isMobile ? '-' : '<em>Нет данных</em>';
                const $tr = $(`
                    <tr>
                        <td class="team-col">${escapeHtml(team)}</td>
                        <td>${roundNum}</td>
                        <td class="question-col ${isMobile ? 'clickable' : ''}" ${isMobile ? 'data-question="" data-round="'+roundNum+'" data-num="-"' : ''}>${questionText}</td>
                        <td class="score-col">0</td>
                    </tr>
                `);
                $tbody.append($tr);
            } else {
                // Есть данные
                teamData.forEach((row, index) => {
                    const scoreDisplay = row.score > 0 ? '+' + row.score : row.score;
                    
                    // На мобильном показываем только номер вопроса
                    let questionText;
                    if (isMobile) {
                        questionText = `${row.questionNum}`;
                    } else {
                        const questionKey = `${row.round}-${row.questionNum}`;
                        questionText = questionsData[questionKey] || row.question || `Вопрос ${row.questionNum}`;
                    }
                    
                    const questionKey = `${row.round}-${row.questionNum}`;
                    const fullQuestion = questionsData[questionKey] || row.question || `Вопрос ${row.questionNum}`;
                    
                    const $tr = $(`
                        <tr>
                            <td class="team-col">${escapeHtml(row.team)}</td>
                            <td>${row.round}</td>
                            <td class="question-col ${isMobile ? 'clickable' : ''}" ${isMobile ? 'data-question="'+escapeHtml(fullQuestion)+'" data-round="'+row.round+'" data-num="'+row.questionNum+'"' : ''}>${escapeHtml(questionText)}</td>
                            <td class="score-col">${scoreDisplay}</td>
                        </tr>
                    `);
                    $tbody.append($tr);
                });
            }
        });
        return;
    }

    // Для "Все раунды" показываем только существующие данные
    if (filteredData.length === 0) {
        $tbody.append(`
            <tr>
                <td colspan="4" class="text-center">Нет данных для отображения</td>
            </tr>
        `);
        return;
    }

    const isMobile = $(window).width() <= 768;

    filteredData.forEach((row, index) => {
        const scoreDisplay = row.score > 0 ? '+' + row.score : row.score;
        
        // На мобильном показываем только номер вопроса
        let questionText;
        if (isMobile) {
            questionText = `${row.questionNum}`;
        } else {
            const questionKey = `${row.round}-${row.questionNum}`;
            questionText = questionsData[questionKey] || row.question || `Вопрос ${row.questionNum}`;
        }
        
        const questionKey = `${row.round}-${row.questionNum}`;
        const fullQuestion = questionsData[questionKey] || row.question || `Вопрос ${row.questionNum}`;
        
        const $tr = $(`
            <tr>
                <td class="team-col">${escapeHtml(row.team)}</td>
                <td>${row.round}</td>
                <td class="question-col ${isMobile ? 'clickable' : ''}" ${isMobile ? 'data-question="'+escapeHtml(fullQuestion)+'" data-round="'+row.round+'" data-num="'+row.questionNum+'"' : ''}>${escapeHtml(questionText)}</td>
                <td class="score-col">${scoreDisplay}</td>
            </tr>
        `);

        $tr.css('animation-delay', `${index * 0.05}s`);
        $tbody.append($tr);
    });
}

// ========================================
// Переключение раундов
// ========================================
function switchRound(round) {
    currentRound = round;

    // Обновляем активную вкладку
    $('.round-tab').removeClass('active');
    $(`.round-tab[data-round="${round}"]`).addClass('active');

    // Обновляем таблицу
    updateResultsTable();
}

// ========================================
// Обновление графиков
// ========================================
function updateCharts() {
    updateProgressChart();
    updateDistributionChart();
}

function updateProgressChart() {
    const ctx = document.getElementById('progressChart');
    if (!ctx) return;

    // Используем команды из списка
    const teams = teamsList.length > 0 ? teamsList : [...new Set(quizData.map(row => row.team))];
    const rounds = [1, 2, 3, 4, 5, 6];

    const datasets = teams.map((team, index) => {
        const teamData = quizData.filter(row => row.team === team);
        const cumulativeScores = [];
        let cumulative = 0;

        rounds.forEach(round => {
            const roundRows = teamData.filter(row => row.round === round);
            const roundScore = roundRows.reduce((sum, row) => sum + row.score, 0);
            
            // Проверяем, сыгран ли этот раунд (есть ли данные)
            const hasData = roundRows.length > 0;
            
            if (hasData) {
                cumulative += roundScore;
                cumulativeScores.push(cumulative);
            } else {
                // Нет данных - ставим null, чтобы линия прерывалась
                cumulativeScores.push(null);
            }
        });

        const colors = [
            'rgba(30, 136, 229, 0.8)',
            'rgba(229, 57, 53, 0.8)',
            'rgba(255, 179, 0, 0.8)',
            'rgba(142, 36, 170, 0.8)',
            'rgba(67, 160, 71, 0.8)',
            'rgba(255, 87, 34, 0.8)',
            'rgba(0, 188, 212, 0.8)',
        ];

        return {
            label: team,
            data: cumulativeScores,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('0.8', '0.2'),
            tension: 0.3,
            fill: false,
            spanGaps: false // Не соединять точки через null
        };
    });

    if (progressChart) {
        progressChart.destroy();
    }

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: rounds.map(r => `Р${r}`),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: 2,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 10,
                        font: {
                            size: 10
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

function updateDistributionChart() {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;

    // Используем команды из списка
    const teams = teamsList.length > 0 ? teamsList : [...new Set(quizData.map(row => row.team))];
    
    // Считаем общие баллы по командам
    const teamScores = {};
    teams.forEach(team => {
        teamScores[team] = 0;
    });
    quizData.forEach(row => {
        if (teamScores[row.team] !== undefined) {
            teamScores[row.team] += row.score;
        }
    });

    const labels = teams;
    const data = teams.map(team => teamScores[team] || 0);

    const colors = [
        'rgba(30, 136, 229, 0.8)',
        'rgba(229, 57, 53, 0.8)',
        'rgba(255, 179, 0, 0.8)',
        'rgba(142, 36, 170, 0.8)',
        'rgba(67, 160, 71, 0.8)',
        'rgba(255, 87, 34, 0.8)',
        'rgba(0, 188, 212, 0.8)',
    ];

    if (distributionChart) {
        distributionChart.destroy();
    }

    distributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Общий счёт',
                data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            devicePixelRatio: 2,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// ========================================
// Обновление времени
// ========================================
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU');
    $('#lastUpdate').html(`<i class="fas fa-clock"></i> Последнее обновление: ${timeStr}`);
}

// ========================================
// Утилиты
// ========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Экспорт функций для отладки
window.quizApp = {
    loadAllData,
    switchRound,
    startAutoRefresh,
    stopAutoRefresh,
    get data() { return quizData; },
    get questions() { return questionsData; },
    get teams() { return teamsList; }
};
