const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

const dnaStrands = new Map(); // In-memory DNA model for nuggets

// Create Nugget Handler
const createNuggetHandler = (req, res) => {
  const { userId, content, promptId, context, type, origin, semanticIndex, temporalCluster, contextAttribution } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dummy_jwt_secret_123');
    if (!userId || !content || !promptId || !context?.sessionId) {
      return res.status(400).json({ error: 'Missing required fields', requestId: uuidv4() });
    }
    const nuggetId = uuidv4();
    const sessionId = context.sessionId;
    const codon = {
      nuggetId,
      content,
      promptId,
      type: type || 'Condition',
      origin: origin || 'User',
      semanticIndex: semanticIndex || [],
      temporalCluster: temporalCluster || new Date().toISOString(),
      contextAttribution: contextAttribution || { userId, agentId: null },
      timestamp: new Date().toISOString()
    };
    const strand = dnaStrands.get(sessionId) || { sessionId, codons: [] };
    strand.codons.push(codon);
    dnaStrands.set(sessionId, strand);
    if (global.wss) {
      global.wss.clients.forEach(client => {
        if (client.sessionId === sessionId) {
          client.send(JSON.stringify({ type: 'nugget_update', ...codon, requestId: uuidv4() }));
        }
      });
    }
    res.status(200).json({ status: 'success', nuggetId, sessionId, requestId: uuidv4() });
  } catch (err) {
    res.status(401).json({ error: 'Invalid JWT', requestId: uuidv4() });
  }
};

// Query Nugget Handler
const queryNuggetHandler = (req, res) => {
  const { filters } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dummy_jwt_secret_123');
    const nuggets = Array.from(dnaStrands.values()).flatMap(s => s.codons).filter(n => {
      return (
        (!filters?.riskLevel || n.riskLevel === filters.riskLevel) &&
        (!filters?.agent || n.contextAttribution?.agentId === filters.agent) &&
        (!filters?.strategy || n.content.includes(filters.strategy))
      );
    });
    res.status(200).json({ nuggets, requestId: uuidv4() });
  } catch (err) {
    res.status(401).json({ error: 'Invalid JWT', requestId: uuidv4() });
  }
};

// Update Nugget Outcome Handler
const updateNuggetOutcomeHandler = (req, res) => {
  const { nuggetId, sessionId, outcome } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dummy_jwt_secret_123');
    const strand = dnaStrands.get(sessionId);
    if (!strand) return res.status(404).json({ error: 'Session not found', requestId: uuidv4() });
    const codon = strand.codons.find(c => c.nuggetId === nuggetId);
    if (!codon) return res.status(404).json({ error: 'Nugget not found', requestId: uuidv4() });
    codon.outcome = outcome;
    dnaStrands.set(sessionId, strand);
    if (global.wss) {
      global.wss.clients.forEach(client => {
        if (client.sessionId === sessionId) {
          client.send(JSON.stringify({ type: 'nugget_update', nuggetId, outcome, requestId: uuidv4() }));
        }
      });
    }
    res.status(200).json({ status: 'success', nuggetId, sessionId, requestId: uuidv4() });
  } catch (err) {
    res.status(401).json({ error: 'Invalid JWT', requestId: uuidv4() });
  }
};

app.post('/nugget/create', createNuggetHandler);
app.post('/nugget/query', queryNuggetHandler);
app.patch('/nugget/:id/outcome', updateNuggetOutcomeHandler);

app.listen(3000, () => {
  console.log('🚀 apiBridge.js running on port 3000');
});
