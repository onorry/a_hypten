const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const users = [
  {
    login: 'doctor',
    password: 'doctor123',
    role: 'doctor',
    name: 'Врач'
  },
  {
    login: 'user',
    password: 'user123',
    role: 'user',
    name: 'Пользователь'
  }
];

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

  const user = users.find(item =>
    item.login === login &&
    item.password === password
  );

  if (!user) {
    return res.status(401).json({
      error: 'Неверный логин или пароль'
    });
  }

  res.json({
    login: user.login,
    role: user.role,
    name: user.name
  });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});