const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function loadOntology() {
  const filePath = path.join(__dirname, 'ontology2.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'A_Hypten backend' });
});

app.get('/api/ontology', (req, res) => {
  try {
    const ontology = loadOntology();
    res.json(ontology);
  } catch (error) {
    res.status(500).json({
      error: 'Не удалось загрузить онтологию',
      details: error.message,
      directory: __dirname
    });
  }
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;

  try {
    const ontology = loadOntology();

    const userClass = ontology.nodes.find(node =>
      node.name === '# Пользователь'
    );

    if (!userClass) {
      return res.status(500).json({
        error: 'В онтологии не найден класс пользователей'
      });
    }

    const userNodes = ontology.relations
      .filter(relation =>
        relation.name === 'is_a' &&
        relation.destination_node_id === userClass.id
      )
      .map(relation =>
        ontology.nodes.find(node =>
          node.id === relation.source_node_id
        )
      )
      .filter(Boolean);

    const user = userNodes.find(node =>
      node.attributes?.login === login &&
      node.attributes?.password === password
    );

    if (!user) {
      return res.status(401).json({
        error: 'Неверный логин или пароль'
      });
    }

    const roleRelation = ontology.relations.find(relation =>
      relation.name === 'has_role' &&
      relation.source_node_id === user.id
    );

    const roleNode = roleRelation
      ? ontology.nodes.find(node =>
          node.id === roleRelation.destination_node_id
        )
      : null;

    res.json({
      login: user.attributes.login,
      name: user.name,
      role: roleNode?.name || 'user'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Ошибка авторизации',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});