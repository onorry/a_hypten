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
let pressureData = null;

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

function getNodeByName(name) {
  if (!ontologyData) return null;
  return ontologyData.nodes.find(n => n.name.toLowerCase() === name.toLowerCase()) || null;
}

function addSymptomByName(name) {
  const node = getNodeByName(name);

  if (!node) {
    console.warn(`Симптом не найден в онтологии: ${name}`);
    return;
  }

  if (!selectedSymptoms.includes(node.name)) {
    selectedSymptoms.push(node.name);
  }
}

function addSymptomNode(node) {
  if (!node) return;

  if (!selectedSymptoms.includes(node.name)) {
    selectedSymptoms.push(node.name);
  }
}

function updateSelectedSymptomsView() {
  selectedList.innerHTML = selectedSymptoms.length
    ? selectedSymptoms.map(item => `<li>${item}</li>`).join('')
    : '<li>Пока симптомы не выявлены</li>';
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
  pressureData = null;
  currentQuestion = null;

  openScreen('symptoms');

  const pressureForm = document.getElementById('pressureForm');
  const questionBox = document.getElementById('questionBox');
  const systolicInput = document.getElementById('systolicInput');
  const diastolicInput = document.getElementById('diastolicInput');

  if (pressureForm) pressureForm.style.display = 'flex';

  if (systolicInput) systolicInput.value = '';
  if (diastolicInput) diastolicInput.value = '';

  if (questionBox) {
    questionBox.innerHTML = `
      <p class="text">
        Сначала введите показатели артериального давления,
        затем система продолжит анализ по вопросам.
      </p>
    `;
  }

  statusBox.className = 'status-box success';
  statusTitle.textContent = 'Анализ еще не выполнен';
  statusText.textContent = 'Введите верхнее и нижнее давление, чтобы начать анализ.';

  selectedList.innerHTML = '<li>Пока симптомы не выявлены</li>';
  recommendationList.innerHTML = '<li>Рекомендации появятся после завершения анализа.</li>';
}

function startPressureAnalysis() {
  const systolicInput = document.getElementById('systolicInput');
  const diastolicInput = document.getElementById('diastolicInput');
  const pressureForm = document.getElementById('pressureForm');

  const systolic = Number(systolicInput?.value);
  const diastolic = Number(diastolicInput?.value);

  if (!systolic || !diastolic || systolic < 40 || diastolic < 30) {
    statusBox.className = 'status-box warning';
    statusTitle.textContent = 'Некорректные данные давления';
    statusText.textContent = 'Введите верхнее и нижнее давление числом, например 140 и 90.';
    return;
  }

  const systolicRange = findPressureRangeFromOntology('systolic', systolic);
  const diastolicRange = findPressureRangeFromOntology('diastolic', diastolic);

  pressureData = {
    systolic,
    diastolic,
    systolicRange: systolicRange?.name || 'Диапазон верхнего давления не определён',
    diastolicRange: diastolicRange?.name || 'Диапазон нижнего давления не определён',
    category: getPressureCategory(systolicRange, diastolicRange)
  };

  applyPressureRanges(systolicRange, diastolicRange);
  updateSelectedSymptomsView();

  if (pressureForm) pressureForm.style.display = 'none';

  currentQuestion = getStartQuestion();

  if (!currentQuestion) {
    console.warn('Стартовый вопрос не найден');
    finishQuestionnaire();
    return;
  }

  statusBox.className = pressureData.category === 'crisis'
    ? 'status-box warning'
    : 'status-box success';

  statusTitle.textContent = 'Давление обработано';
  statusText.textContent = `Введено АД: ${systolic}/${diastolic} мм рт. ст. ${pressureData.systolicRange}; ${pressureData.diastolicRange}.`;

  renderQuestion(currentQuestion);
}

function findPressureRangeFromOntology(kind, value) {
  if (!ontologyData) return null;

  const ranges = ontologyData.nodes.filter(node => {
    const attrs = node.attributes || {};

    return attrs.type === 'pressure_range' && attrs.kind === kind;
  });

  return ranges.find(node => {
    const attrs = node.attributes || {};

    const min = attrs.min === '' || attrs.min === undefined
      ? -Infinity
      : Number(attrs.min);

    const max = attrs.max === '' || attrs.max === undefined
      ? Infinity
      : Number(attrs.max);

    return value >= min && value <= max;
  }) || null;
}

function applyPressureRanges(systolicRange, diastolicRange) {
  [systolicRange, diastolicRange].forEach(rangeNode => {
    if (!rangeNode) return;

    const symptomRelations = ontologyData.relations.filter(r =>
      r.source_node_id === rangeNode.id &&
      r.name === 'detects_symptom'
    );

    symptomRelations.forEach(relation => {
      const symptom = ontologyNodesById[relation.destination_node_id];
      addSymptomNode(symptom);
    });
  });
}

function getPressureCategory(systolicRange, diastolicRange) {
  const categories = [
    systolicRange?.attributes?.category,
    diastolicRange?.attributes?.category
  ].filter(Boolean);

  if (categories.includes('crisis')) return 'crisis';
  if (categories.includes('hypertension_stage_2')) return 'hypertension_stage_2';
  if (categories.includes('hypertension_stage_1')) return 'hypertension_stage_1';
  if (categories.includes('elevated')) return 'elevated';
  if (categories.includes('low')) return 'low';

  return 'normal';
}

function renderQuestion(question) {
  const questionBox = document.getElementById('questionBox');

  if (!questionBox) {
    console.error('Не найден questionBox');
    return;
  }

  if (!question || question.name === 'Завершить опрос и выполнить анализ') {
    finishQuestionnaire();
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
    const symptomRelations = ontologyData.relations.filter(r =>
      r.source_node_id === currentQuestion.id &&
      r.name === 'detects_symptom'
    );

    symptomRelations.forEach(relation => {
      const symptom = ontologyNodesById[relation.destination_node_id];
      addSymptomNode(symptom);
    });
  }

  updateSelectedSymptomsView();

  const nextRelationName = answer === 'yes'
    ? 'next_if_yes'
    : 'next_if_no';

  const nextRelation = ontologyData.relations.find(r =>
    r.source_node_id === currentQuestion.id &&
    r.name === nextRelationName
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

  if (questionBox) {
    questionBox.innerHTML = `
      <h3>Анализ завершён</h3>
      <p class="text">
        Результат сформирован на основе введённого давления и ваших ответов.
      </p>
    `;
  }

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
      id: syndrome.id,
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

function getRecommendationsFromOntology(syndromeId) {
  if (!ontologyData) return [];

  const recommendationRelations = ontologyData.relations.filter(r =>
    r.source_node_id === syndromeId &&
    r.name === 'recommendation'
  );

  return recommendationRelations
    .map(relation => ontologyNodesById[relation.destination_node_id])
    .filter(Boolean)
    .map(node => node.attributes?.text || node.name)
    .filter(Boolean);
}

function getFallbackRecommendations(name) {
  const lower = name.toLowerCase();

  if (lower.includes('криз') || lower.includes('экстр')) {
    return [
      'Результат не является диагнозом. При выраженном ухудшении состояния необходимо срочно обратиться за медицинской помощью.',
      'Не откладывайте обращение к специалисту при боли в груди, одышке, нарушении речи, слабости или спутанности сознания.',
      'До консультации специалиста избегайте физической нагрузки и повторно проконтролируйте давление.'
    ];
  }

  if (lower.includes('энцефалопат') || lower.includes('невролог')) {
    return [
      'Результат носит справочный характер и не заменяет консультацию врача.',
      'При нарушении сознания, судорогах, слабости или нарушении речи рекомендуется срочно обратиться за медицинской помощью.'
    ];
  }

  if (lower.includes('ретинопат') || lower.includes('офтальмолог')) {
    return [
      'При изменениях зрения рекомендуется обратиться к врачу для очной оценки состояния.',
      'Сохраните результат анализа и данные давления для последующего наблюдения.'
    ];
  }

  return [
    'Результат является предварительной оценкой и не является диагнозом.',
    'При повторении или усилении симптомов рекомендуется обратиться к врачу.',
    'Сохраните результат анализа для наблюдения в динамике.'
  ];
}

function analyzeQuestionnaireResult() {
  const found = findDiagnosesBySymptoms(selectedSymptoms);

  updateSelectedSymptomsView();

  if (!found.length) {
    statusBox.className = 'status-box success';
    statusTitle.textContent = 'Подходящее состояние не определено';
    statusText.textContent = 'По результатам анализа точное совпадение не найдено.';
    recommendationList.innerHTML = '<li>При ухудшении состояния обратитесь к врачу.</li>';
    addHistoryItem('Подходящее состояние не определено', selectedSymptoms);
    return;
  }

  const best = found[0];
  const alternatives = found.slice(1, 4);

  statusBox.className = best.score >= 0.5
    ? 'status-box warning'
    : 'status-box success';

  statusTitle.textContent = `Наиболее вероятное состояние: ${best.name}`;

  const pressureText = pressureData
    ? ` Введённое АД: ${pressureData.systolic}/${pressureData.diastolic} мм рт. ст. Категории: ${pressureData.systolicRange}; ${pressureData.diastolicRange}.`
    : '';

  statusText.textContent =
    `Совпало симптомов: ${best.matchCount} из ${best.total}.${pressureText}`;

  let recommendations = getRecommendationsFromOntology(best.id);

  if (!recommendations.length) {
    recommendations = getFallbackRecommendations(best.name);
  }

  if (alternatives.length) {
    recommendations.push(
      `Также по части признаков подходят: ${alternatives.map(item => item.name).join(', ')}.`
    );
  }

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
        .map(item => {
          const pressureText = item.pressure
            ? `<p class="history-text">АД: ${item.pressure.systolic}/${item.pressure.diastolic} мм рт. ст.</p>`
            : '';

          return `
            <div class="history-item">
              <div class="history-top">
                <p class="history-name">${item.diagnosis}</p>
                <span class="history-date">${formatDate(item.date)}</span>
              </div>

              ${pressureText}

              <p class="history-text">
                Симптомы: ${item.symptoms.join(', ')}.
              </p>
            </div>
          `;
        })
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
    pressure: pressureData,
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

    if (!response.ok) {
      throw new Error('Не удалось загрузить ontology2.json');
    }

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

    if (ontologyInfo) {
      ontologyInfo.textContent = 'Ошибка загрузки онтологии';
    }
  }
}

function openOntologyViewer() {
  const modal = document.getElementById('ontologyModal');
  const content = document.getElementById('ontologyContent');

  if (!modal || !content || !ontologyData) return;

  const syndromeClassId = getClassIdByName('# Синдром');
  const symptomClassId = getClassIdByName('# Симптом');

  const syndromes = ontologyData.relations
    .filter(r =>
      r.name === 'is_a' &&
      r.destination_node_id === syndromeClassId
    )
    .map(r => ontologyNodesById[r.source_node_id])
    .filter(Boolean);

  const symptoms = ontologyData.relations
    .filter(r =>
      r.name === 'is_a' &&
      r.destination_node_id === symptomClassId
    )
    .map(r => ontologyNodesById[r.source_node_id])
    .filter(Boolean);

  const pressureRanges = ontologyData.nodes.filter(node =>
    node.attributes?.type === 'pressure_range'
  );

  const questions = ontologyData.nodes.filter(node =>
    ontologyData.relations.some(r =>
      r.source_node_id === node.id &&
      (
        r.name === 'next_if_yes' ||
        r.name === 'next_if_no'
      )
    )
  );

  content.innerHTML = `
    <div class="ontology-section">
      <h3>Синдромы</h3>

      ${syndromes.map(syndrome => {
        const syndromeSymptoms = ontologyData.relations
          .filter(r =>
            r.name === 'symptom' &&
            r.source_node_id === syndrome.id
          )
          .map(r => ontologyNodesById[r.destination_node_id]?.name)
          .filter(Boolean);

        const recommendations = ontologyData.relations
          .filter(r =>
            r.name === 'recommendation' &&
            r.source_node_id === syndrome.id
          )
          .map(r => ontologyNodesById[r.destination_node_id])
          .filter(Boolean)
          .map(node => node.attributes?.text || node.name);

        return `
          <div class="ontology-card">
            <h4>${syndrome.name}</h4>

            <div class="ontology-subtitle">
              Связанные симптомы
            </div>

            <ul>
              ${syndromeSymptoms.map(item => `<li>${item}</li>`).join('')}
            </ul>

            <div class="ontology-subtitle">
              Рекомендации
            </div>

            <ul>
              ${recommendations.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }).join('')}
    </div>

    <div class="ontology-section">
      <h3>Диапазоны артериального давления</h3>

      ${pressureRanges.map(range => `
        <div class="ontology-card">
          <h4>${range.name}</h4>

          <p>
            Тип: ${range.attributes?.kind || '—'}
          </p>

          <p>
            Диапазон:
            ${range.attributes?.min || '0'}
            —
            ${range.attributes?.max || '∞'}
          </p>

          <p>
            Категория:
            ${range.attributes?.category || '—'}
          </p>
        </div>
      `).join('')}
    </div>

    <div class="ontology-section">
      <h3>Вопросы</h3>

      ${questions.map(question => {
        const yesRelation = ontologyData.relations.find(r =>
          r.source_node_id === question.id &&
          r.name === 'next_if_yes'
        );

        const noRelation = ontologyData.relations.find(r =>
          r.source_node_id === question.id &&
          r.name === 'next_if_no'
        );

        return `
          <div class="ontology-card">
            <h4>${question.name}</h4>

            <p>
              Да →
              ${
                yesRelation
                  ? ontologyNodesById[yesRelation.destination_node_id]?.name
                  : 'Завершение'
              }
            </p>

            <p>
              Нет →
              ${
                noRelation
                  ? ontologyNodesById[noRelation.destination_node_id]?.name
                  : 'Завершение'
              }
            </p>
          </div>
        `;
      }).join('')}
    </div>

    <div class="ontology-section">
      <h3>Симптомы</h3>

      <div class="ontology-tags">
        ${symptoms.map(symptom => `
          <span class="ontology-tag">
            ${symptom.name}
          </span>
        `).join('')}
      </div>
    </div>
  `;

  modal.classList.add('active');
}

function closeOntologyViewer() {
  const modal = document.getElementById('ontologyModal');

  if (modal) {
    modal.classList.remove('active');
  }
}

loadHistoryFromStorage();
renderHistory();
loadOntology();
