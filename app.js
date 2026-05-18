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