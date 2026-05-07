# SkillNet Client SDK

TypeScript SDK for SkillNet - Open Infrastructure for Creating, Evaluating, and Connecting AI Agent Skills.

## Features

- 🔍 **Search** - Find skills via keyword match or AI semantic search
- 📦 **Download** - Install skills from GitHub repositories
- ✨ **Create** - Convert various sources into structured skill packages
- 📊 **Evaluate** - Score skills on 5 quality dimensions
- 🕸️ **Analyze** - Map relationships between skills

## Installation

```bash
npm install skillnet-client
```

Or using yarn:

```bash
yarn add skillnet-client
```

## Quick Start

```typescript
import { SkillNetClient, SearchMode } from 'skillnet-client';

const client = new SkillNetClient();

// Search for skills
const results = await client.search({ q: 'pdf', limit: 5 });
console.log(results[0].skillName, results[0].stars);

// Semantic search
const semanticResults = await client.search({
  q: 'analyze financial PDF reports',
  mode: SearchMode.Vector,
  threshold: 0.85
});

// Download a skill
const localPath = await client.download({
  url: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
  targetDir: './my_skills'
});
```

## Configuration

```typescript
const client = new SkillNetClient({
  apiKey: 'sk-...',           // Required for create/evaluate/analyze
  skillnetUrl: 'http://api-skillnet.openkg.cn/v1',  // SkillNet API server
  baseUrl: 'https://api.openai.com/v1',             // LLM API endpoint
  githubToken: 'ghp-...'      // Optional: for private repos
});
```

## API Reference

### Search

```typescript
// Keyword search
const results = await client.search({
  q: 'pdf',
  limit: 10,
  minStars: 5,
  sortBy: 'stars'  // or 'recent'
});

// Semantic search
const results = await client.search({
  q: 'analyze financial reports',
  mode: SearchMode.Vector,
  threshold: 0.85
});

// Filter by category
const results = await client.search({
  q: 'pdf',
  category: 'Development'
});
```

### Download

```typescript
const path = await client.download({
  url: 'https://github.com/owner/repo',
  targetDir: './skills'
});
```

### Create

Requires API key.

```typescript
// From trajectory/logs
const result = await client.create({
  trajectoryContent: 'User: rename .jpg to .png\nAgent: Done.',
  outputDir: './skills'
});

// From GitHub repo
const result = await client.create({
  githubUrl: 'https://github.com/owner/repo',
  outputDir: './skills'
});

// From office document
const result = await client.create({
  officeFile: './guide.pdf',
  outputDir: './skills'
});

// From prompt with custom model
const result = await client.create({
  prompt: 'A skill for web scraping',
  outputDir: './skills',
  model: 'gpt-4o'
});
```

### Evaluate

Requires API key. Scores skills on 5 dimensions: Safety, Completeness, Executability, Maintainability, Cost-Awareness.

```typescript
const result = await client.evaluate({
  target: 'https://github.com/owner/repo'
});

console.log(result.evaluation.safety);
console.log(result.evaluation.completeness);
```

### Analyze

Requires API key. Maps relationships between skills.

```typescript
const relationships = await client.analyze({
  skillsDir: './my_skills'
});

for (const rel of relationships) {
  console.log(`${rel.source} --[${rel.type}]--> ${rel.target}`);
}
```

## Environment Variables

| Variable        | Required For              | Default                              |
|----------------|---------------------------|--------------------------------------|
| `API_KEY`      | create · evaluate · analyze | —                                    |
| `SKILLNET_URL` | Custom SkillNet server    | `http://api-skillnet.openkg.cn/v1`   |
| `BASE_URL`     | Custom LLM endpoint       | `https://api.openai.com/v1`          |
| `GITHUB_TOKEN` | Private repos             | —                                    |

## License

MIT
