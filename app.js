const screens = document.querySelectorAll('.screen');
const sideButtons = document.querySelectorAll('.side-btn');
const mobileButtons = document.querySelectorAll('.mobile-btn');

const statusBox = document.getElementById('statusBox');
const statusTitle = document.getElementById('statusTitle');
const statusText = document.getElementById('statusText');
const selectedList = document.getElementById('selectedList');
const recommendationList = document.getElementById('recommendationList');

const ontologyInfo = document.getElementById('ontologyInfo');
const symptomCountStat = document.getElementById('symptomCountStat');

const historyScreen = document.getElementById('screen-history');

let ontologyData = null;
let ontologyNodesById = {};
let syndromeMap = [];
let analysisHistory = [];

let currentQuestion = null;
let selectedSymptoms = [];
let answers = [];

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

function getStartQuestion() {
  const startRelation = ontologyData.relations.find(
    r => r.name === 'start_question'
  );

  if (!startRelation) return null;

  return ontologyNodesById[startRelation.destination_node_id];
}

function startQuestionnaire() {
  selectedSymptoms = [];
  answers = [];

  currentQuestion = getStartQuestion();

  if (!currentQuestion) {
    console.warn('Стартовый вопрос не найден');
    return;
  }

  openScreen('symptoms');

  renderQuestion(currentQuestion);

  statusBox.className = 'status-box success';
  statusTitle.textContent = 'Анализ начат';
  statusText.textContent =
    'Ответьте на вопросы, чтобы система определила возможное состояние.';

  selectedList.innerHTML =
    '<li>Пока симптомы не выявлены</li>';

  recommendationList.innerHTML =
    '<li>Рекомендации появятся после завершения анализа.</li>';
}

function renderQuestion(question) {
  const questionBox = document.getElementById('questionBox');

  if (!questionBox) {
    console.error('Не найден questionBox');
    return;
  }

  questionBox.innerHTML = `
    <div class="question-card">
      <h3>${question.name}</h3>

      <div class="btn-row">
        <button class="btn btn-primary" onclick="answerQuestion('yes')">
          Да
        </button>

        <button class="btn btn-secondary" onclick="answerQuestion('no')">
          Нет
        </button>
      </div>
    </div>
  `;
}

function answerQuestion(answer) {
  if (!currentQuestion) return;

  answers.push({
    question: currentQuestion.name,
    answer
  });

  if (answer === 'yes') {
    const symptomRelation = ontologyData.relations.find(r =>
      r.source_node_id === currentQuestion.id &&
      r.name === 'detects_symptom'
    );

    if (symptomRelation) {
      const symptom =
        ontologyNodesById[symptomRelation.destination_node_id];

      if (symptom && !selectedSymptoms.includes(symptom.name)) {
        selectedSymptoms.push(symptom.name);
      }
    }
  }

  selectedList.innerHTML = selectedSymptoms.length
    ? selectedSymptoms.map(item => `<li>${item}</li>`).join('')
    : '<li>Пока симптомы не выявлены</li>';

  const nextRelationName =
    answer === 'yes'
      ? 'next_if_yes'
      : 'next_if_no';

  const nextRelation = ontologyData.relations.find(r =>
    r.source_node_id === currentQuestion.id &&
    r.name === nextRelationName
  );

  if (nextRelation) {
    currentQuestion =
      ontologyNodesById[nextRelation.destination_node_id];

    renderQuestion(currentQuestion);
  } else {
    finishQuestionnaire();
  }
}

function finishQuestionnaire() {
  const questionBox = document.getElementById('questionBox');

  questionBox.innerHTML = `
    <h3>Анализ завершён</h3>
    <p class="text">
      Результат сформирован на основе ваших ответов.
    </p>
  `;

  analyzeQuestionnaireResult();
}

function buildSyndromeMap() {
  const syndromeClassId = getClassIdByName('# Синдром');

  if (!syndromeClassId) return [];

  const syndromeIds = new Set(
    ontologyData.relations
      .filter(r =>
        r.name === 'is_a' &&
        r.destination_node_id === syndromeClassId
      )
      .map(r => r.source_node_id)
  );

  return [...syndromeIds]
    .map(id => {
      const name = ontologyNodesById[id]?.name;

      if (!name) return null;

      const symptoms = ontologyData.relations
        .filter(r =>
          r.name === 'symptom' &&
          r.source_node_id === id
        )
        .map(r =>
          ontologyNodesById[r.destination_node_id]?.name
        )
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
  const normalizedSelected =
    selected.map(s => s.toLowerCase());

  const results = syndromeMap.map(syndrome => {
    const syndromeSymptoms = syndrome.symptoms;

    const matchedSymptoms =
      syndromeSymptoms.filter(symptom =>
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
      if (b.score !== a.score)
        return b.score - a.score;

      if (b.matchCount !== a.matchCount)
        return b.matchCount - a.matchCount;

      return a.name.localeCompare(b.name, 'ru');
    });
}

function getRecommendationsByDiagnosis(name) {
  const lower = name.toLowerCase();

  if (lower.includes('криз')) {
    return [
      'Немедленно обратиться за медицинской помощью.',
      'Избегать физической нагрузки.',
      'Контролировать давление.'
    ];
  }

  if (lower.includes('энцефалопат')) {
    return [
      'Как можно скорее обратиться к врачу.',
      'Контролировать неврологические симптомы.'
    ];
  }

  return [
    'Использовать результат как вспомогательную информацию.',
    'При ухудшении состояния обратиться к врачу.'
  ];
}

function analyzeQuestionnaireResult() {
  const found = findDiagnosesBySymptoms(selectedSymptoms);

  if (!found.length) {
    statusTitle.textContent =
      'Подходящее состояние не определено';

    statusText.textContent =
      'По результатам опроса точное совпадение не найдено.';

    recommendationList.innerHTML =
      '<li>При ухудшении состояния обратитесь к врачу.</li>';

    return;
  }

  const best = found[0];

  statusTitle.textContent =
    `Наиболее вероятное состояние: ${best.name}`;

  statusText.textContent =
    `Совпало симптомов: ${best.matchCount} из ${best.total}.`;

  const recommendations =
    getRecommendationsByDiagnosis(best.name);

  recommendationList.innerHTML = recommendations
    .map(item => `<li>${item}</li>`)
    .join('');

  addHistoryItem(best.name, selectedSymptoms);
}

function openScreen(name) {
  screens.forEach(screen => {
    screen.classList.toggle(
      'active',
      screen.id === `screen-${name}`
    );
  });

  [...sideButtons, ...mobileButtons].forEach(btn => {
    btn.classList.toggle(
      'active',
      btn.dataset.screen === name
    );
  });
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU');
}

function saveHistoryToStorage() {
  localStorage.setItem(
    'ahypten_history',
    JSON.stringify(analysisHistory)
  );
}

function loadHistoryFromStorage() {
  const raw = localStorage.getItem('ahypten_history');

  if (!raw) {
    analysisHistory = [];
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

      <div class="history-list">
        ${historyList}
      </div>

      <div class="btn-row">
        <button
          class="btn btn-secondary"
          onclick="clearHistory()"
        >
          Очистить историю
        </button>
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

async function loadOntology() {
  try {
    const response = await fetch('ontology2.json');

    if (!response.ok)
      throw new Error('Не удалось загрузить ontology2.json');

    ontologyData = await response.json();

    ontologyNodesById = buildNodesById(ontologyData);

    syndromeMap = buildSyndromeMap();

    if (symptomCountStat) {
      symptomCountStat.textContent = ontologyData.nodes.length;
    }

    if (ontologyInfo) {
      ontologyInfo.textContent =
        `Загружено элементов онтологии: ${ontologyData.nodes.length}`;
    }
  } catch (error) {
    console.error(error);
  }
}

loadHistoryFromStorage();
renderHistory();
loadOntology();