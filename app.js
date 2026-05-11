const screens = document.querySelectorAll('.screen');
const sideButtons = document.querySelectorAll('.side-btn');
const mobileButtons = document.querySelectorAll('.mobile-btn');

const searchInput = document.getElementById('searchInput');
const selectedCount = document.getElementById('selectedCount');
const symptomGrid = document.getElementById('symptomGrid');

const statusBox = document.getElementById('statusBox');
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
const selectedList = document.getElementById('selectedList');
const recommendationList = document.getElementById('recommendationList');

const ontologyInfo = document.getElementById('ontologyInfo');
const symptomCountStat = document.getElementById('symptomCountStat');

const historyScreen = document.getElementById('screen-history');

let ontologyData = null;
let ontologySymptoms = [];
let ontologyNodesById = {};
let syndromeMap = [];
let analysisHistory = [];
let currentQuestion = null;
let selectedSymptoms = [];
let answers = [];

function getStartQuestion() {
  const startRelation = ontologyData.relations.find(r => r.name === 'start_question');
  if (!startRelation) return null;

  return ontologyNodesById[startRelation.destination_node_id];
}

function renderQuestion(question) {
  const questionBox = document.getElementById('questionBox');

  questionBox.innerHTML = `
    <h3>${question.name}</h3>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="answerQuestion('yes')">Да</button>
      <button class="btn btn-secondary" onclick="answerQuestion('no')">Нет</button>
    </div>
  `;
}

function answerQuestion(answer) {
  if (!currentQuestion) return;

  answers.push({
    question: currentQuestion.name,
    answer: answer
  });

  if (answer === 'yes') {
    const symptomRelation = ontologyData.relations.find(r =>
      r.source_node_id === currentQuestion.id && r.name === 'detects_symptom'
    );

    if (symptomRelation) {
      const symptom = ontologyNodesById[symptomRelation.destination_node_id];
      if (symptom) selectedSymptoms.push(symptom.name);
    }
  }

  const nextRelationName = answer === 'yes' ? 'next_if_yes' : 'next_if_no';

  const nextRelation = ontologyData.relations.find(r =>
    r.source_node_id === currentQuestion.id && r.name === nextRelationName
  );

  if (nextRelation) {
    currentQuestion = ontologyNodesById[nextRelation.destination_node_id];
    renderQuestion(currentQuestion);
  } else {
    finishQuestionnaire();
  }
}

function finishQuestionnaire() {
  const questionBox = document.getElementById('questionBox');

  questionBox.innerHTML = `
    <h3>Опрос завершён</h3>
    <p>Выбранные симптомы: ${selectedSymptoms.join(', ') || 'не выявлены'}</p>
    <button class="btn btn-primary" onclick="analyzeQuestionnaireResult()">Показать результат</button>
  `;
}

function analyzeQuestionnaireResult() {
  const found = findDiagnosesBySymptoms(selectedSymptoms);

  if (!found.length) {
    statusTitle.textContent = 'Подходящее состояние не определено';
    statusText.textContent = 'По результатам опроса точное совпадение не найдено.';
    recommendationList.innerHTML = '<li>При ухудшении состояния обратитесь к врачу.</li>';
    return;
  }

  const best = found[0];

  statusTitle.textContent = `Наиболее вероятное состояние: ${best.name}`;
  statusText.textContent = `Совпало симптомов: ${best.matchCount} из ${best.total}.`;

  const recommendations = getRecommendationsByDiagnosis(best.name);
  recommendationList.innerHTML = recommendations.map(item => `<li>${item}</li>`).join('');

  addHistoryItem(best.name, selectedSymptoms);
}

function openScreen(name) {
  screens.forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen-${name}`);
  });

  [...sideButtons, ...mobileButtons].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
}

function updateSelectedCount() {
  const count = document.querySelectorAll('.symptom-card.active').length;
  selectedCount.textContent = `Выбрано симптомов: ${count}`;
}

function clearSymptoms() {
  document.querySelectorAll('.symptom-card').forEach(card => card.classList.remove('active'));
  updateSelectedCount();

  statusBox.className = 'status-box success';
  statusTitle.textContent = 'Анализ еще не выполнен';
  statusText.textContent = 'Выберите симптомы и нажмите кнопку «Получить результат».';
  selectedList.innerHTML = '<li>Нет данных</li>';
  recommendationList.innerHTML = '<li>После анализа здесь появятся рекомендации.</li>';
}

function renderSymptoms(list) {
  symptomGrid.innerHTML = '';

  list.forEach(symptom => {
    const card = document.createElement('div');
    card.className = 'symptom-card';
    card.dataset.symptom = symptom;

    card.innerHTML = `
      <div class="symptom-icon">✚</div>
      <div>
        <p class="symptom-title">${symptom}</p>
        <p class="symptom-desc">Выберите симптом для анализа состояния.</p>
      </div>
    `;

    card.addEventListener('click', () => {
      card.classList.toggle('active');
      updateSelectedCount();
    });

    symptomGrid.appendChild(card);
  });
}

function buildNodesById(data) {
  const map = {};
  data.nodes.forEach(node => {
    map[node.id] = node;
  });
  return map;
}

function getClassIdByName(name) {
  const node = ontologyData.nodes.find(n => n.name === name);
  return node ? node.id : null;
}

function extractOntologySymptoms(data) {
  const nodesById = buildNodesById(data);
  const symptomClassId = data.nodes.find(n => n.name === '# Симптом')?.id;
  if (!symptomClassId) return [];

  const symptomIds = new Set(
    data.relations
      .filter(r => r.name === 'is_a' && r.destination_node_id === symptomClassId)
      .map(r => r.source_node_id)
  );

  return [...symptomIds]
    .map(id => nodesById[id]?.name)
    .filter(Boolean)
    .filter(name => !name.startsWith('#'))
    .sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildSyndromeMap() {
  const syndromeClassId = getClassIdByName('# Синдром');
  if (!syndromeClassId) return [];

  const syndromeIds = new Set(
    ontologyData.relations
      .filter(r => r.name === 'is_a' && r.destination_node_id === syndromeClassId)
      .map(r => r.source_node_id)
  );

  return [...syndromeIds]
    .map(id => {
      const name = ontologyNodesById[id]?.name;
      if (!name) return null;

      const symptoms = ontologyData.relations
        .filter(r => r.name === 'symptom' && r.source_node_id === id)
        .map(r => ontologyNodesById[r.destination_node_id]?.name)
        .filter(Boolean);

      return {
        id,
        name,
        symptoms: [...new Set(symptoms)]
      };
    })
    .filter(Boolean);
}

function findDiagnosesBySymptoms(selected) {
  const normalizedSelected = selected.map(s => s.toLowerCase());

  const results = syndromeMap.map(syndrome => {
    const syndromeSymptoms = syndrome.symptoms;
    const matchedSymptoms = syndromeSymptoms.filter(symptom =>
      normalizedSelected.includes(symptom.toLowerCase())
    );

    const matchCount = matchedSymptoms.length;
    const total = syndromeSymptoms.length || 1;
    const score = matchCount / total;

    return {
      name: syndrome.name,
      allSymptoms: syndromeSymptoms,
      matchedSymptoms,
      matchCount,
      total,
      score
    };
  });

  return results
    .filter(item => item.matchCount > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return a.name.localeCompare(b.name, 'ru');
    });
}

function getRecommendationsByDiagnosis(name) {
  const lower = name.toLowerCase();

  if (lower.includes('криз')) {
    return [
      'Немедленно обратиться за медицинской помощью.',
      'Не откладывать обращение при ухудшении состояния.',
      'Избегать физической нагрузки до консультации специалиста.'
    ];
  }

  if (lower.includes('энцефалопат')) {
    return [
      'Как можно скорее обратиться к врачу.',
      'Контролировать самочувствие и неврологические симптомы.',
      'Не заниматься самолечением.'
    ];
  }

  if (lower.includes('ретинопат')) {
    return [
      'Обратиться к врачу для дополнительного обследования.',
      'Контролировать изменения зрения.',
      'Сохранить результат анализа для наблюдения в динамике.'
    ];
  }

  if (lower.includes('злокачественная')) {
    return [
      'В кратчайшие сроки обратиться к врачу.',
      'Контролировать состояние и фиксировать симптомы.',
      'Не откладывать обследование.'
    ];
  }

  if (lower.includes('гипертенз')) {
    return [
      'Проконтролировать состояние и самочувствие.',
      'При повторении симптомов обратиться к врачу.',
      'Сохранить результат в истории наблюдений.'
    ];
  }

  return [
    'Использовать результат как вспомогательную информацию.',
    'При усилении симптомов обратиться к врачу.',
    'Сохранить результат для дальнейшего наблюдения.'
  ];
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU');
}

function saveHistoryToStorage() {
  localStorage.setItem('ahypten_history', JSON.stringify(analysisHistory));
}

function loadHistoryFromStorage() {
  const raw = localStorage.getItem('ahypten_history');
  if (!raw) {
    analysisHistory = [
      {
        diagnosis: 'Риск гипертензивного состояния',
        date: '2026-04-12T10:00:00',
        symptoms: ['Головная боль', 'Головокружение', 'Шум в ушах']
      },
      {
        diagnosis: 'Сердечно-сосудистый риск',
        date: '2026-04-05T10:00:00',
        symptoms: ['Нарушение зрения', 'Головная боль']
      }
    ];
    saveHistoryToStorage();
    return;
  }

  try {
    analysisHistory = JSON.parse(raw);
  } catch {
    analysisHistory = [];
  }
}

function renderHistory() {
  const historyList = analysisHistory.length
    ? analysisHistory
        .slice()
        .reverse()
        .map(item => `
          <div class="history-item">
            <div class="history-top">
              <p class="history-name">${item.diagnosis}</p>
              <span class="history-date">${formatDate(item.date)}</span>
            </div>
            <p class="history-text">
              Симптомы: ${item.symptoms.join(', ')}.
            </p>
          </div>
        `)
        .join('')
    : `
      <div class="history-item">
        <p class="history-text">История пока пуста.</p>
      </div>
    `;

  historyScreen.innerHTML = `
    <div class="card">
      <h3>История обращений</h3>
      <p class="text" style="margin-bottom:16px;">
        Результаты предыдущих анализов отображаются в этом разделе.
      </p>

      <div class="history-list">
        ${historyList}
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" onclick="clearHistory()">Очистить историю</button>
      </div>
    </div>
  `;
}

function addHistoryItem(diagnosis, symptoms) {
  analysisHistory.push({
    diagnosis,
    symptoms,
    date: new Date().toISOString()
  });
  saveHistoryToStorage();
  renderHistory();
}

function clearHistory() {
  analysisHistory = [];
  saveHistoryToStorage();
  renderHistory();
}

function analyzeSymptoms() {
  const selected = [...document.querySelectorAll('.symptom-card.active')]
    .map(card => card.dataset.symptom);

  if (selected.length === 0) {
    statusBox.className = 'status-box warning';
    statusTitle.textContent = 'Симптомы не выбраны';
    statusText.textContent = 'Перед анализом необходимо выбрать хотя бы один симптом.';
    selectedList.innerHTML = '<li>Нет выбранных симптомов</li>';
    recommendationList.innerHTML = '<li>Выберите симптомы и повторите анализ.</li>';
    return;
  }

  selectedList.innerHTML = selected.map(item => `<li>${item}</li>`).join('');

  const found = findDiagnosesBySymptoms(selected);

  if (!found.length) {
    statusBox.className = 'status-box success';
    statusTitle.textContent = 'Подходящее состояние не определено';
    statusText.textContent = 'По выбранным симптомам точное совпадение не найдено.';
    recommendationList.innerHTML = `
      <li>Повторите анализ с другим набором симптомов.</li>
      <li>При ухудшении самочувствия обратитесь к врачу.</li>
    `;
    addHistoryItem('Подходящее состояние не определено', selected);
    return;
  }

  const best = found[0];
  const alternatives = found.slice(1, 3);

  statusBox.className = best.score >= 0.5 ? 'status-box warning' : 'status-box success';
  statusTitle.textContent = `Наиболее вероятное состояние: ${best.name}`;
  statusText.textContent = `Совпало симптомов: ${best.matchCount} из ${best.total}.`;

  let recommendations = getRecommendationsByDiagnosis(best.name);

  if (alternatives.length) {
    recommendations = recommendations.concat([
      `Также возможны состояния: ${alternatives.map(item => item.name).join(', ')}.`
    ]);
  }

  recommendationList.innerHTML = recommendations.map(item => `<li>${item}</li>`).join('');

  addHistoryItem(best.name, selected);
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    const value = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.symptom-card').forEach(card => {
      const title = card.querySelector('.symptom-title').textContent.toLowerCase();
      const visible = title.includes(value);
      card.style.display = visible ? 'flex' : 'none';
    });
  });
}

async function loadOntology() {
  try {
    const response = await fetch('ontology2.json');
    if (!response.ok) throw new Error('Не удалось загрузить ontology2.json');

    ontologyData = await response.json();
    ontologyNodesById = buildNodesById(ontologyData);
    ontologySymptoms = extractOntologySymptoms(ontologyData);
    syndromeMap = buildSyndromeMap();

    if (ontologySymptoms.length) {
      renderSymptoms(ontologySymptoms);
      symptomCountStat.textContent = ontologySymptoms.length;
      ontologyInfo.textContent = `Доступно симптомов: ${ontologySymptoms.length}`;
    } else {
      ontologyInfo.textContent = 'Доступно симптомов: 0';
      symptomCountStat.textContent = '0';
    }
  } catch (error) {
    const fallbackSymptoms = [
      'Головная боль',
      'Головокружение',
      'Нарушение зрения',
      'Нарушение сознания',
      'Судороги',
      'Тошнота',
      'тревожность',
      'Кровоизлияние в сетчатке',
      'Отек диска зрительного нерва'
    ];

    renderSymptoms(fallbackSymptoms);
    symptomCountStat.textContent = fallbackSymptoms.length;
    ontologyInfo.textContent = `Доступно симптомов: ${fallbackSymptoms.length}`;

    ontologyData = null;
    ontologyNodesById = {};
    syndromeMap = [];
  }
currentQuestion = getStartQuestion();

if (currentQuestion) {
  renderQuestion(currentQuestion);
}
}

loadHistoryFromStorage();
renderHistory();
loadOntology();