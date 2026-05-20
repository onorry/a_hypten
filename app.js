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

  return ontologyData.nodes.find(
    n => n.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

function addSymptomNode(node) {
  if (!node) return;

  if (!selectedSymptoms.includes(node.name)) {
    selectedSymptoms.push(node.name);
  }
}

function updateSelectedSymptomsView() {
  selectedList.classList.add('symptom-tags-list');

  selectedList.innerHTML = selectedSymptoms.length
    ? selectedSymptoms.map(item => `
        <li class="symptom-tag-item">${item}</li>
      `).join('')
    : '<li class="symptom-tag-item muted">Пока симптомы не выявлены</li>';
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

  if (pressureForm) {
    pressureForm.style.display = 'flex';
  }

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
  statusText.textContent =
    'Введите верхнее и нижнее давление, чтобы начать анализ.';

  selectedList.innerHTML =
    '<li>Пока симптомы не выявлены</li>';

  recommendationList.innerHTML =
    '<li>Рекомендации появятся после завершения анализа.</li>';
}

function startPressureAnalysis() {
  const systolicInput = document.getElementById('systolicInput');
  const diastolicInput = document.getElementById('diastolicInput');
  const pressureForm = document.getElementById('pressureForm');

  const systolic = Number(systolicInput?.value);
  const diastolic = Number(diastolicInput?.value);

  if (!systolic || !diastolic || systolic < 40 || diastolic < 30) {
    statusBox.className = 'status-box warning';

    statusTitle.textContent =
      'Некорректные данные давления';

    statusText.textContent =
      'Введите верхнее и нижнее давление числом, например 140 и 90.';

    return;
  }

  const systolicRange =
    findPressureRangeFromOntology('systolic', systolic);

  const diastolicRange =
    findPressureRangeFromOntology('diastolic', diastolic);

  pressureData = {
    systolic,
    diastolic,
    systolicRange:
      systolicRange?.name ||
      'Диапазон верхнего давления не определён',

    diastolicRange:
      diastolicRange?.name ||
      'Диапазон нижнего давления не определён',

    category: getPressureCategory(
      systolicRange,
      diastolicRange
    )
  };

  applyPressureRanges(
    systolicRange,
    diastolicRange
  );

  updateSelectedSymptomsView();

  if (pressureForm) {
    pressureForm.style.display = 'none';
  }

  currentQuestion = getStartQuestion();

  if (!currentQuestion) {
    finishQuestionnaire();
    return;
  }

  statusBox.className =
    pressureData.category === 'crisis'
      ? 'status-box warning'
      : 'status-box success';

  statusTitle.textContent = 'Давление обработано';

  statusText.textContent =
    `Введённое АД: ${systolic}/${diastolic} мм рт. ст. ` +
    `${pressureData.systolicRange}; ` +
    `${pressureData.diastolicRange}.`;

  renderQuestion(currentQuestion);
}

function findPressureRangeFromOntology(kind, value) {
  if (!ontologyData) return null;

  const ranges = ontologyData.nodes.filter(node => {
    const attrs = node.attributes || {};

    return (
      attrs.type === 'pressure_range' &&
      attrs.kind === kind
    );
  });

  return ranges.find(node => {
    const attrs = node.attributes || {};

    const min =
      attrs.min === '' || attrs.min === undefined
        ? -Infinity
        : Number(attrs.min);

    const max =
      attrs.max === '' || attrs.max === undefined
        ? Infinity
        : Number(attrs.max);

    return value >= min && value <= max;
  }) || null;
}

function applyPressureRanges(
  systolicRange,
  diastolicRange
) {
  [systolicRange, diastolicRange].forEach(rangeNode => {
    if (!rangeNode) return;

    const symptomRelations =
      ontologyData.relations.filter(r =>
        r.source_node_id === rangeNode.id &&
        r.name === 'detects_symptom'
      );

    symptomRelations.forEach(relation => {
      const symptom =
        ontologyNodesById[relation.destination_node_id];

      addSymptomNode(symptom);
    });
  });
}

function getPressureCategory(
  systolicRange,
  diastolicRange
) {
  const categories = [
    systolicRange?.attributes?.category,
    diastolicRange?.attributes?.category
  ].filter(Boolean);

  if (categories.includes('crisis')) return 'crisis';

  if (categories.includes('hypertension_stage_2')) {
    return 'hypertension_stage_2';
  }

  if (categories.includes('hypertension_stage_1')) {
    return 'hypertension_stage_1';
  }

  if (categories.includes('elevated')) return 'elevated';

  if (categories.includes('low')) return 'low';

  return 'normal';
}

function renderQuestion(question) {
  const questionBox =
    document.getElementById('questionBox');

  if (!questionBox) return;

  if (
    !question ||
    question.name ===
      'Завершить опрос и выполнить анализ'
  ) {
    finishQuestionnaire();
    return;
  }

  questionBox.innerHTML = `
    <div class="question-card">
      <h3>${question.name}</h3>

      <div class="btn-row">
        <button
          class="btn btn-primary"
          onclick="answerQuestion('yes')"
        >
          Да
        </button>

        <button
          class="btn btn-secondary"
          onclick="answerQuestion('no')"
        >
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
    const symptomRelations =
      ontologyData.relations.filter(r =>
        r.source_node_id === currentQuestion.id &&
        r.name === 'detects_symptom'
      );

    symptomRelations.forEach(relation => {
      const symptom =
        ontologyNodesById[relation.destination_node_id];

      addSymptomNode(symptom);
    });
  }

  updateSelectedSymptomsView();

  const nextRelationName =
    answer === 'yes'
      ? 'next_if_yes'
      : 'next_if_no';

  const nextRelation =
    ontologyData.relations.find(r =>
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
  const questionBox =
    document.getElementById('questionBox');

  if (questionBox) {
    questionBox.innerHTML = `
      <h3>Анализ завершён</h3>

      <p class="text">
        Результат сформирован на основе
        введённого давления и ваших ответов.
      </p>
    `;
  }

  analyzeQuestionnaireResult();
}

function buildSyndromeMap() {
  const syndromeClassId =
    getClassIdByName('# Синдром');

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

      const symptoms =
        ontologyData.relations
          .filter(r =>
            r.name === 'symptom' &&
            r.source_node_id === id
          )
          .map(r =>
            ontologyNodesById[
              r.destination_node_id
            ]?.name
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
    const syndromeSymptoms =
      syndrome.symptoms;

    const matchedSymptoms =
      syndromeSymptoms.filter(symptom =>
        normalizedSelected.includes(
          symptom.toLowerCase()
        )
      );

    const matchCount =
      matchedSymptoms.length;

    const total =
      syndromeSymptoms.length || 1;

    const score =
      matchCount / total;

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
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }

      return a.name.localeCompare(
        b.name,
        'ru'
      );
    });
}

function getRecommendationsFromOntology(
  syndromeId
) {
  if (!ontologyData) return [];

  const recommendationRelations =
    ontologyData.relations.filter(r =>
      r.source_node_id === syndromeId &&
      r.name === 'recommendation'
    );

  return recommendationRelations
    .map(relation =>
      ontologyNodesById[
        relation.destination_node_id
      ]
    )
    .filter(Boolean)
    .map(
      node =>
        node.attributes?.text ||
        node.name
    )
    .filter(Boolean);
}

function getFallbackRecommendations(name) {
  return [
    'Результат является предварительной оценкой и не является диагнозом.',
    'При ухудшении состояния рекомендуется обратиться к врачу.',
    'Контролируйте артериальное давление в динамике.'
  ];
}

function analyzeQuestionnaireResult() {
  const found =
    findDiagnosesBySymptoms(
      selectedSymptoms
    );

  updateSelectedSymptomsView();

  if (!found.length) {
    statusBox.className =
      'status-box success';

    statusTitle.textContent =
      'Подходящее состояние не определено';

    statusText.textContent =
      'По результатам анализа точное совпадение не найдено.';

    recommendationList.innerHTML =
      '<li>При ухудшении состояния обратитесь к врачу.</li>';

    addHistoryItem(
      'Подходящее состояние не определено',
      selectedSymptoms
    );

    return;
  }

  const best = found[0];
const possibleMatches = found.slice(0, 5);

statusBox.className =
  best.score >= 0.5
    ? 'status-box warning'
    : 'status-box success';

statusTitle.textContent =
  `Наиболее вероятное состояние: ${best.name}`;

const pressureText = pressureData
  ? `Введённое АД: ${pressureData.systolic}/${pressureData.diastolic} мм рт. ст.`
  : '';

statusText.innerHTML = `
  <p>
    ${pressureText}
  </p>

  <p>
    Совпало симптомов:
    ${best.matchCount} из ${best.total}.
  </p>

  <div class="match-list">
    <div class="match-title">
      Возможные совпадения:
    </div>

    ${possibleMatches.map(item => `
      <div class="match-item">
        <div class="match-name">
          ${item.name}
        </div>

        <div class="match-meta">
          Совпадений: ${item.matchCount} из ${item.total}
        </div>
      </div>
    `).join('')}
  </div>
`;

let recommendations =
  getRecommendationsFromOntology(best.id);

if (!recommendations.length) {
  recommendations =
    getFallbackRecommendations(best.name);
}

recommendationList.innerHTML =
  recommendations
    .map(item => `<li>${item}</li>`)
    .join('');

addHistoryItem(
  best.name,
  selectedSymptoms
);
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
  return new Date(date)
    .toLocaleDateString('ru-RU');
}

function saveHistoryToStorage() {
  localStorage.setItem(
    'ahypten_history',
    JSON.stringify(analysisHistory)
  );
}

function loadHistoryFromStorage() {
  const raw =
    localStorage.getItem('ahypten_history');

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
  const historyList =
    analysisHistory.length
      ? analysisHistory
          .slice()
          .reverse()
          .map(item => {
            const pressureText =
              item.pressure
                ? `
                  <p class="history-text">
                    АД:
                    ${item.pressure.systolic}/${item.pressure.diastolic}
                    мм рт. ст.
                  </p>
                `
                : '';

            return `
              <div class="history-item">
                <div class="history-top">
                  <p class="history-name">
                    ${item.diagnosis}
                  </p>

                  <span class="history-date">
                    ${formatDate(item.date)}
                  </span>
                </div>

                ${pressureText}

                <p class="history-text">
                  Симптомы:
                  ${item.symptoms.join(', ')}.
                </p>
              </div>
            `;
          })
          .join('')
      : `
        <div class="history-item">
          <p class="history-text">
            История пока пуста.
          </p>
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

function addHistoryItem(
  diagnosis,
  symptoms
) {
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
    const response = await fetch('https://a-hypten.onrender.com/api/ontology');

    if (!response.ok) {
      throw new Error(
        'Не удалось загрузить ontology2.json'
      );
    }

    ontologyData =
      await response.json();

    ontologyNodesById =
      buildNodesById(ontologyData);

    syndromeMap =
      buildSyndromeMap();

    if (symptomCountStat) {
      const symptomClassId = getClassIdByName('# Симптом');

const symptomCount = ontologyData.relations.filter(relation =>
  relation.name === 'is_a' &&
  relation.destination_node_id === symptomClassId
).length;

symptomCountStat.textContent = symptomCount;
    }

    if (ontologyInfo) {
      ontologyInfo.textContent =
        `Загружено симптомов: ${symptomCount}`;
    }
  } catch (error) {
    console.error(error);

    if (ontologyInfo) {
      ontologyInfo.textContent =
        'Ошибка загрузки онтологии';
    }
  }
}

let currentOntologyTab = 'syndromes';

function openOntologyViewer() {
  const modal = document.getElementById('ontologyModal');

  if (!modal || !ontologyData) return;

  modal.classList.add('open');
  renderOntologyTab('syndromes');
}

function closeOntologyViewer() {
  const modal = document.getElementById('ontologyModal');

  if (modal) {
    modal.classList.remove('open');
  }
}

function renderOntologyTab(tabName) {
  currentOntologyTab = tabName;

  const content = document.getElementById('ontologyViewerContent');
  const tabs = document.querySelectorAll('.ontology-tab');

  if (!content || !ontologyData) return;

  tabs.forEach(tab => {
    tab.classList.toggle(
      'active',
      tab.dataset.ontologyTab === tabName
    );
  });

  if (tabName === 'syndromes') {
    renderOntologySyndromes(content);
  }

  if (tabName === 'pressure') {
    renderOntologyPressure(content);
  }

  if (tabName === 'questions') {
    renderOntologyQuestions(content);
  }

  if (tabName === 'symptoms') {
    renderOntologySymptoms(content);
  }
}

function renderOntologySyndromes(content) {
  const syndromeClassId = getClassIdByName('# Синдром');

  const syndromes = ontologyData.relations
    .filter(r =>
      r.name === 'is_a' &&
      r.destination_node_id === syndromeClassId
    )
    .map(r => ontologyNodesById[r.source_node_id])
    .filter(Boolean);

  content.innerHTML = `
    <div class="ontology-section">
      <h3>Синдромы</h3>

      <div class="ontology-section-list">
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
            <div class="ontology-item">
              <p class="ontology-item-title">${syndrome.name}</p>

              <p class="ontology-item-meta">Связанные симптомы:</p>

              <div class="ontology-tags">
                ${syndromeSymptoms.length
                  ? syndromeSymptoms.map(item => `
                    <span class="ontology-tag">${item}</span>
                  `).join('')
                  : '<span class="ontology-tag">Нет связанных симптомов</span>'
                }
              </div>

              <p class="ontology-item-meta" style="margin-top:12px;">
                Рекомендации:
              </p>

              <ul class="clean-list">
                ${recommendations.length
                  ? recommendations.map(item => `<li>${item}</li>`).join('')
                  : '<li>Рекомендации не указаны</li>'
                }
              </ul>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderOntologyPressure(content) {
  const pressureRanges = ontologyData.nodes.filter(node => {
  const attrs = node.attributes || {};
  return attrs.type === 'pressure_range';
});

  content.innerHTML = `
    <div class="ontology-section">
      <h3>Диапазоны давления</h3>

      <div class="ontology-section-list">
        ${pressureRanges.length
          ? pressureRanges.map(range => {
            const attrs = range.attributes || {};

            return `
              <div class="ontology-item">
                <p class="ontology-item-title">${range.name}</p>

                <p class="ontology-item-meta">
                  Тип давления: ${attrs.kind || 'не указан'}
                </p>

                <p class="ontology-item-meta">
                  Минимальное значение: ${attrs.min || '—'}
                </p>

                <p class="ontology-item-meta">
                  Максимальное значение: ${attrs.max || '—'}
                </p>

                <p class="ontology-item-meta">
                  Категория: ${attrs.category || '—'}
                </p>
              </div>
            `;
          }).join('')
          : `
            <div class="ontology-item">
              <p class="ontology-item-title">
                Диапазоны давления не найдены
              </p>
              <p class="ontology-item-meta">
                Проверьте, что в узлах онтологии есть атрибут
                type: pressure_range.
              </p>
            </div>
          `
        }
      </div>
    </div>
  `;
}

function renderOntologyQuestions(content) {
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
      <h3>Вопросы</h3>

      <div class="ontology-section-list">
        ${questions.map(question => {
          const yesRelation = ontologyData.relations.find(r =>
            r.source_node_id === question.id &&
            r.name === 'next_if_yes'
          );

          const noRelation = ontologyData.relations.find(r =>
            r.source_node_id === question.id &&
            r.name === 'next_if_no'
          );

          const symptomRelations = ontologyData.relations
            .filter(r =>
              r.source_node_id === question.id &&
              r.name === 'detects_symptom'
            )
            .map(r => ontologyNodesById[r.destination_node_id]?.name)
            .filter(Boolean);

          return `
            <div class="ontology-item">
              <p class="ontology-item-title">${question.name}</p>

              <p class="ontology-item-meta">
                При ответе «Да» →
                ${yesRelation
                  ? ontologyNodesById[yesRelation.destination_node_id]?.name
                  : 'завершение анализа'}
              </p>

              <p class="ontology-item-meta">
                При ответе «Нет» →
                ${noRelation
                  ? ontologyNodesById[noRelation.destination_node_id]?.name
                  : 'завершение анализа'}
              </p>

              <div class="ontology-tags">
                ${symptomRelations.length
                  ? symptomRelations.map(item => `
                    <span class="ontology-tag">${item}</span>
                  `).join('')
                  : '<span class="ontology-tag">Симптом не указан</span>'
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderOntologySymptoms(content) {
  const symptomClassId = getClassIdByName('# Симптом');

  const symptoms = ontologyData.relations
    .filter(r =>
      r.name === 'is_a' &&
      r.destination_node_id === symptomClassId
    )
    .map(r => ontologyNodesById[r.source_node_id])
    .filter(Boolean);

  content.innerHTML = `
    <div class="ontology-section">
      <h3>Симптомы</h3>

      <div class="ontology-tags">
        ${symptoms.map(symptom => `
          <span class="ontology-tag">${symptom.name}</span>
        `).join('')}
      </div>
    </div>
  `;
}

let currentUser = null;

function openLoginModal() {
  const modal = document.getElementById('loginModal');

  if (modal) {
    modal.classList.add('open');
  }
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');

  if (modal) {
    modal.classList.remove('open');
  }
}

function loadUserFromStorage() {
  const raw = localStorage.getItem('ahypten_user');

  if (!raw) {
    currentUser = null;
    updateAuthView();
    return;
  }

  try {
    currentUser = JSON.parse(raw);
  } catch {
    currentUser = null;
  }

  updateAuthView();
}

async function loginUser() {
  const loginInput = document.getElementById('loginInput');
  const passwordInput = document.getElementById('passwordInput');
  const loginStatus = document.getElementById('loginStatus');

  const login = loginInput?.value.trim();
  const password = passwordInput?.value.trim();

  if (!login || !password) {
    if (loginStatus) {
      loginStatus.textContent = 'Введите логин и пароль.';
    }
    return;
  }

  try {
    const response = await fetch('https://a-hypten.onrender.com/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ login, password })
    });

    if (!response.ok) {
      throw new Error('Неверный логин или пароль');
    }

    currentUser = await response.json();

    localStorage.setItem(
      'ahypten_user',
      JSON.stringify(currentUser)
    );

    updateAuthView();
    closeLoginModal();
  } catch (error) {
    currentUser = null;
    localStorage.removeItem('ahypten_user');

    if (loginStatus) {
      loginStatus.textContent = 'Неверный логин или пароль.';
    }

    updateAuthView();
  }
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem('ahypten_user');
  updateAuthView();
}

function updateAuthView() {
  const authStatus = document.getElementById('authStatus');
  const loginOpenButton = document.getElementById('loginOpenButton');
  const logoutButton = document.getElementById('logoutButton');
  const doctorButtons = document.querySelectorAll('.doctor-only');
  const loginStatus = document.getElementById('loginStatus');

  if (authStatus) {
    authStatus.textContent = currentUser
      ? `${currentUser.name} (${currentUser.role})`
      : 'Не выполнен вход';
  }

  if (loginStatus) {
    loginStatus.textContent = currentUser
      ? `Вы вошли как: ${currentUser.name} (${currentUser.role})`
      : 'Пользователь не авторизован.';
  }

  if (loginOpenButton) {
    loginOpenButton.style.display = currentUser ? 'none' : 'inline-flex';
  }

  if (logoutButton) {
    logoutButton.style.display = currentUser ? 'inline-flex' : 'none';
  }

  doctorButtons.forEach(button => {
    button.style.display =
      currentUser?.role === 'doctor'
        ? 'inline-flex'
        : 'none';
  });
}

loadHistoryFromStorage();
renderHistory();
loadOntology();
loadUserFromStorage();