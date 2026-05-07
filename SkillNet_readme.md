<div align="center">
<a href="http://skillnet.openkg.cn/">
    <img src="images/skillnet.png" width="200" alt="SkillNet Logo">
</a>

<p><strong>Open Infrastructure for Creating, Evaluating, and Connecting AI Agent Skills</strong></p>

<p>
Search 400,000+ community skills · One-line install · Auto-create from repos / docs / logs<br/>
5-dimension quality scoring · Semantic relationship graph
</p>

[![PyPI version](https://badge.fury.io/py/skillnet-ai.svg)](https://pypi.org/project/skillnet-ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![arXiv](https://img.shields.io/badge/arXiv-b5212f.svg?logo=arxiv)](https://arxiv.org/abs/2603.04448)
[![Hugging Face](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-FFD21E)](https://huggingface.co/blog/xzwnlp/skillnet)
[![Website](https://img.shields.io/badge/🌐_Website-skillnet.openkg.cn-0078D4.svg)](http://skillnet.openkg.cn/)

<!-- <p align="center">
  <a href="#-quick-start">Installation</a> •
  <a href="#-python-sdk">Python SDK</a> •
  <a href="#-cli-reference">CLI</a> •
  <a href="https://arxiv.org/abs/2603.04448">Paper</a> •
  <a href="http://skillnet.openkg.cn/">Website</a> •
  <a href="https://huggingface.co/blog/xzwnlp/skillnet">HuggingFace</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="https://x.com/_akhaliq/status/2030024322308342160" target="_blank">Featured By AK</a>
</p> -->

</div>

<h5 align="center"> ⭐ If you like our project, please give us a star on GitHub for the latest updates!</h5>

---

**SkillNet** is an open-source platform that treats AI agent skills as first-class, shareable packages — like npm for AI capabilities. It provides end-to-end tooling to **search**, **install**, **create**, **evaluate**, and **organize** skills, so agents can learn from the community and continuously grow.

- We conducted experiments on ALFWorld, WebShop, and ScienceWorld. Reproduction scripts are provided [here](https://github.com/zjunlp/SkillNet/tree/main/experiments).
![graph-ezgif com-optimize](https://github.com/user-attachments/assets/1d27d046-48a1-4ab2-a6f5-58c8fa07a134)


## 📢 News
- **🤖 [2026-03-26] JiuwenClaw × SkillNet Integrated!** — [JiuwenClaw](https://github.com/openJiuwen-ai/jiuwenclaw) now natively integrates SkillNet as its built-in skill marketplace. One-click search and install curated skills. [View Guide →](./examples/JiuwenClaw/README.md)

- **🔌 [2026-03-12] SkillNet MCP Server Released!** — We've launched the Model Context Protocol (MCP) integration (maintained by [CycleChain](https://github.com/CycleChain), special thanks for this great contribution!). [Learn more →](#-model-context-protocol-mcp-integration)

- **📄 [2026-03-04] SkillNet Technical Report Released!** — We've published the comprehensive SkillNet Technical Report, covering the system architecture, automated creation pipeline, multi-dimensional evaluation methodology, and the released open-source toolkits. [View Report →](https://arxiv.org/abs/2603.04448)

- **🦞 [2026-02-23] OpenClaw Integration Released!** — SkillNet is now available as a built-in skill for [OpenClaw](https://github.com/openclaw/openclaw). One command to install, zero config to use. The agent automatically searches, downloads, creates, evaluates, and analyzes skills on your behalf. [Get started →](#-openclaw-integration)

## ✨ Key Features

| Feature                                 | Description                                                                                                             |
| :-------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| 🔍&nbsp;**Search**                      | Find skills via keyword match or AI semantic search across 500+ curated skills                                          |
| 📦&nbsp;**One&#8209;Line&nbsp;Install** | `skillnet download <url>` — grab any skill from GitHub in seconds                                                       |
| ✨&nbsp;**Auto&#8209;Create**           | Convert GitHub repos, PDFs/PPTs/Word docs, conversation logs, or text prompts into structured skill packages using LLMs |
| 📊&nbsp;**5&#8209;D&nbsp;Evaluation**   | Score skills on **Safety · Completeness · Executability · Maintainability · Cost‑Awareness**                            |
| 🕸️&nbsp;**Skill&nbsp;Graph**            | Auto-discover `similar_to` · `belong_to` · `compose_with` · `depend_on` links between skills                            |

---

## 📖 Table of Contents

- [Quick Start](#-quick-start)
- [REST API](#-rest-api)
- [Python SDK](#-python-sdk)
- [CLI Reference](#-cli-reference)
- [Configuration](#configuration)
- [Example: Scientific Discovery](#-example-scientific-discovery)
- [OpenClaw Integration](#-openclaw-integration)
- [Model Context Protocol (MCP)](#-model-context-protocol-mcp-integration)
- [Contributing](#-contributing)
- [Citation](#-citation)

---

## 🚀 Quick Start

```bash
pip install skillnet-ai
```

Or using `uv`:

```bash
uv venv
source .venv/bin/activate
uv pip install skillnet-ai
```

```python
from skillnet_ai import SkillNetClient

client = SkillNetClient()  # No API key needed for search & download

# Search for skills
results = client.search(q="pdf", limit=5)
print(results[0].skill_name, results[0].stars)

# Install a skill
client.download(url=results[0].skill_url, target_dir="./my_skills")
```

**🌐 SkillNet Web** — Search, download individual skills, and explore curated skill collections through the [SkillNet website](http://skillnet.openkg.cn/).

<div align="center">

https://github.com/user-attachments/assets/9f9d35b0-36fd-4d7d-a072-39afa380b241

</div>

**🤖 OpenClaw + SkillNet** — See SkillNet in action with [OpenClaw](https://github.com/openclaw/openclaw). The agent automatically searches, creates, evaluates, and analyzes skills on your behalf. [Learn more →](#-openclaw-integration)

<div align="center">

https://github.com/user-attachments/assets/9d49a00c-827d-47a4-8954-0e6b977ca547

</div>

---

## 🌐 REST API

The SkillNet search API is free, public, and requires no authentication.

```bash
# Keyword search
curl "http://api-skillnet.openkg.cn/v1/search?q=pdf&sort_by=stars&limit=5"

# Semantic search
curl "http://api-skillnet.openkg.cn/v1/search?q=reading%20charts&mode=vector&threshold=0.8"
```

<details>
<summary><b>📡 Full Parameter Reference</b></summary>

**Endpoint:** `GET http://api-skillnet.openkg.cn/v1/search`

| Parameter   | Type   | Default    | Description                                        |
| :---------- | :----- | :--------- | :------------------------------------------------- |
| `q`         | string | _required_ | Search query (keywords or natural language)        |
| `mode`      | string | `keyword`  | `keyword` (fuzzy match) or `vector` (semantic AI)  |
| `category`  | string | —          | Filter: Development, AIGC, Research, Science, etc. |
| `limit`     | int    | `10`       | Results per page (max 50)                          |
| `page`      | int    | `1`        | Page number _(keyword mode only)_                  |
| `min_stars` | int    | `0`        | Minimum star count _(keyword mode only)_           |
| `sort_by`   | string | `stars`    | `stars` or `recent` _(keyword mode only)_          |
| `threshold` | float  | `0.8`      | Similarity threshold 0.0–1.0 _(vector mode only)_  |

**Response:**

```json
{
  "data": [
    {
      "skill_name": "pdf-extractor-v1",
      "skill_description": "Extracts text and tables from PDF documents.",
      "author": "openkg-team",
      "stars": 128,
      "skill_url": "https://...",
      "category": "Productivity"
    }
  ],
  "meta": { "query": "pdf", "mode": "keyword", "total": 1, "limit": 10 },
  "success": true
}
```

</details>

---

## 🐍 Python SDK

### Initialize

```python
from skillnet_ai import SkillNetClient

client = SkillNetClient(
    api_key="sk-...",         # Required for create / evaluate / analyze
    # base_url="...",         # Optional: custom LLM endpoint
    # github_token="ghp-..." # Optional: for private repos
)
```

### Search

```python
# Keyword search
results = client.search(q="pdf", limit=10, min_stars=5, sort_by="stars")

# Semantic search
results = client.search(q="analyze financial PDF reports", mode="vector", threshold=0.85)

if results:
    print(f"{results[0].skill_name} ⭐{results[0].stars}")
```

### Install

```python
local_path = client.download(
    url="https://github.com/anthropics/skills/tree/main/skills/skill-creator",
    target_dir="./my_skills"
)
```

### Create

Convert diverse sources into structured skill packages with a single call:

```python
# From conversation logs / execution traces
client.create(trajectory_content="User: rename .jpg to .png\nAgent: Done.", output_dir="./skills")

# From GitHub repository
client.create(github_url="https://github.com/zjunlp/DeepKE", output_dir="./skills")

# From office documents (PDF / PPT / Word)
client.create(office_file="./guide.pdf", output_dir="./skills")

# From natural language prompt
client.create(prompt="A skill for web scraping article titles", output_dir="./skills")
```

### Evaluate

Score any skill across 5 quality dimensions. Accepts local paths or GitHub URLs.

```python
result = client.evaluate(
    target="https://github.com/anthropics/skills/tree/main/skills/algorithmic-art"
)
# Returns: { "safety": {"level": "Good", "reason": "..."}, "completeness": {...}, ... }
```

### Analyze Relationships

Map the connections between skills in a local directory — outputs `similar_to`, `belong_to`, `compose_with`, and `depend_on` edges.

```python
relationships = client.analyze(skills_dir="./my_skills")

for rel in relationships:
    print(f"{rel['source']} --[{rel['type']}]--> {rel['target']}")
# PDF_Parser --[compose_with]--> Text_Summarizer
```

---

## 💻 CLI Reference

The CLI ships with `pip install skillnet-ai` and offers the same features with rich terminal output.

| Command    | Description            | Example                                  |
| :--------- | :--------------------- | :--------------------------------------- |
| `search`   | Find skills            | `skillnet search "pdf" --mode vector`    |
| `download` | Install a skill        | `skillnet download <url> -d ./skills`    |
| `create`   | Create from any source | `skillnet create log.txt --model gpt-4o` |
| `evaluate` | Quality report         | `skillnet evaluate ./my_skill`           |
| `analyze`  | Relationship graph     | `skillnet analyze ./my_skills`           |

> Use `skillnet <command> --help` for full options.

### Search

```bash
skillnet search "pdf"
skillnet search "analyze financial reports" --mode vector --threshold 0.85
skillnet search "visualization" --category "Development" --sort-by stars --limit 10
```

### Install

```bash
skillnet download https://github.com/anthropics/skills/tree/main/skills/algorithmic-art
skillnet download <url> -d ./my_agent/skills
skillnet download <private_url> --token <your_github_token>

# Use a mirror for faster downloads in restricted networks
skillnet download <url> --mirror https://ghfast.top/
```

### Create

```bash
# From trajectory file
skillnet create ./logs/trajectory.txt -d ./generated_skills

# From GitHub repo
skillnet create --github https://github.com/owner/repo

# From office document (PDF, PPT, Word)
skillnet create --office ./docs/guide.pdf

# From prompt
skillnet create --prompt "A skill for extracting tables from images"
```

### Evaluate

```bash
skillnet evaluate https://github.com/anthropics/skills/tree/main/skills/algorithmic-art
skillnet evaluate ./my_skills/web_search
skillnet evaluate ./my_skills/tool --category "Development" --model gpt-4o
```

### Analyze

```bash
skillnet analyze ./my_agent_skills
skillnet analyze ./my_agent_skills --no-save   # print only, don't write file
skillnet analyze ./my_agent_skills --model gpt-4o
```

---

## <a id="configuration"></a>⚙️ Configuration

### Environment Variables

| Variable         | Required For                       | Default                     |
| :--------------- | :--------------------------------- | :-------------------------- |
| `API_KEY`        | `create` · `evaluate` · `analyze`  | —                           |
| `BASE_URL`       | Custom LLM endpoint                | `https://api.openai.com/v1` |
| `GITHUB_TOKEN`   | Private repos / higher rate limits | —                           |
| `SKILLNET_MODEL` | Default LLM model for all commands | `gpt-4o`                    |
| `GITHUB_MIRROR`  | Faster downloads in restricted networks | —                      |

> `search` and `download` (public repos) work without any credentials.
>
> **Recommended mirror:** [`https://ghfast.top/`](https://ghfast.top/) — set `GITHUB_MIRROR` or pass `--mirror` to speed up downloads in restricted networks.

**Linux / macOS:**

```bash
export API_KEY="sk-..."
export BASE_URL="https://..."  # optional
```

**Windows PowerShell:**

```powershell
$env:API_KEY = "sk-..."
$env:BASE_URL = "https://..."  # optional
```

---

## 🔬 Example: Scientific Discovery

A complete end-to-end demo showing how an AI Agent uses SkillNet to autonomously plan and execute a complex scientific workflow — from raw scRNA-seq data to a cancer target validation report.

![science2](https://github.com/user-attachments/assets/5b65865a-312a-4dd7-ae80-ee1f968e2702)


<table>
<tr><td>1️⃣</td><td><b>Task</b></td><td>User provides a goal: "Analyze scRNA-seq data to find cancer targets"</td></tr>
<tr><td>2️⃣</td><td><b>Plan</b></td><td>Agent decomposes into: Data → Mechanism → Validation → Report</td></tr>
<tr><td>3️⃣</td><td><b>Discover</b></td><td><code>client.search()</code> finds <em>cellxgene-census</em>, <em>kegg-database</em>, etc.</td></tr>
<tr><td>4️⃣</td><td><b>Evaluate</b></td><td>Skills are quality-gated via <code>client.evaluate()</code> before use</td></tr>
<tr><td>5️⃣</td><td><b>Execute</b></td><td>Skills run sequentially to produce a final discovery report</td></tr>
</table>

👉 **[Try the Interactive Demo](http://skillnet.openkg.cn/)** (Website → Scenarios → Science)
&nbsp;|&nbsp;
📓 **[View Notebook](https://github.com/zjunlp/SkillNet/blob/main/examples/scientific_workflow_demo.ipynb)**

---

## 🤖 OpenClaw Integration

SkillNet integrates with [OpenClaw](https://github.com/openclaw/openclaw) as a built-in, lazy-loaded skill. Once installed, your agent automatically:

- **Searches** existing skills before starting complex tasks
- **Creates** new skills from repos, documents, or completed work
- **Evaluates & analyzes** your local library for quality and inter-skill relationships

> Community skills guide execution → successful outcomes become new skills → periodic analysis keeps the library clean.

<details>
<summary><b>📡 Full Usage Reference</b></summary>
    
### 📥 Installation

**Prerequisites:** [OpenClaw](https://github.com/openclaw/openclaw) installed (default workspace: `~/.openclaw/workspace`)

**Option A — CLI:**

```bash
npm i -g clawhub
clawhub install skillnet --workdir ~/.openclaw/workspace
openclaw gateway restart
```

**Option B — Via OpenClaw chat:**

```
Install the skillnet skill from ClawHub.
```

### ⚙️ Configuration

The same three parameters (`API_KEY`, `BASE_URL`, `GITHUB_TOKEN`) apply here — see [Configuration](#configuration) for details.

In OpenClaw, you can pre-configure them in `openclaw.json` so the agent uses them silently — no prompts, no interruptions. If not configured, the agent only asks when a command actually needs the value, injects it for that single call, and never pollutes the global environment.

**Recommended: pre-configure in `openclaw.json`**:

```json
{
  "skills": {
    "entries": {
      "skillnet": {
        "enabled": true,
        "apiKey": "sk-REPLACE_ME",
        "env": {
          "BASE_URL": "https://api.openai.com/v1",
          "GITHUB_TOKEN": "ghp_REPLACE_ME"
        }
      }
    }
  }
}
```

### 🧪 Quick Verification

In your OpenClaw chat, try:

**No credentials needed:**

```
Search SkillNet for a "docker" skill and summarize the top result.
```

**Requires API key:**

```
Create a skill from this GitHub repo: https://github.com/owner/repo (then evaluate it).
```

> The skill source is also available at [`skills/skillnet/`](skills/skillnet/) for reference.

</details>

---

## 🔌 Model Context Protocol (MCP) Integration

The **SkillNet MCP Server** (maintained by [CycleChain](https://github.com/CycleChain)) is a high-performance bridge that enables AI agents (such as Claude Desktop, Cursor, Antigravity and Windsurf) to interact with the SkillNet ecosystem using the [Model Context Protocol](https://modelcontextprotocol.io/).

It empowers agents to autonomously search, download, create, and evaluate 300,000+ specialized skills directly within your IDE or desktop environment.

<details>
<summary><b>📡 Full Usage Reference</b></summary>

### Installation Options

#### 1. Source Build (Node.js & Python)
Ideal for users who want to run the server locally with existing dependencies.

```bash
git clone https://github.com/CycleChain/skillnet-mcp
cd skillnet-mcp
npm install && npm run build
```

#### 2. Docker (Dependency-free)

The most robust way to run the server using the official image from [Docker Hub](https://hub.docker.com/r/fmdogancan/skillnet-mcp).

```bash
docker pull fmdogancan/skillnet-mcp:latest
```

### Quick Configuration (Claude Desktop)

Add the following to your `claude_desktop_config.json`:

#### Option A: Docker (Recommended)
```json
{
  "mcpServers": {
    "skillnet": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "fmdogancan/skillnet-mcp:latest"],
      "env": {
        "API_KEY": "your_api_key_here"
      }
    }
  }
}
```

#### Option B: Build Locally If you prefer to build the image yourself from the source:

```bash
docker build -t skillnet-mcp-local .
```

_(Then, replace `fmdogancan/skillnet-mcp:latest` with `skillnet-mcp-local` in the JSON config above)_

#### Option C: Source Build

```json
{
  "mcpServers": {
    "skillnet": {
      "command": "node",
      "args": ["/absolute/path/to/skillnet-mcp/build/index.js"],
      "env": {
        "API_KEY": "your_api_key_here"
      }
    }
  }
}
```

> **Note:** `search_skills` and `download_skill` tools do not require an API key. An `API_KEY` is only required for `create`, `evaluate`, and `analyze` features.

### Supported Environment Variables

* `API_KEY`: Your API key
* `GITHUB_TOKEN`: GitHub token for private repositories

</details>

---

## 🤝 Contributing

Contributions of all kinds are welcome! Whether it's fixing a typo, adding a feature, or sharing a new skill — every contribution counts.

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feat/amazing-feature`)
5. **Open** a Pull Request

📤 **[Contribute skills](http://skillnet.openkg.cn/)** (Website → Contribute → Submit via URL / Upload Local Skill / Batch Upload Skills)

You can also [open an Issue](https://github.com/zjunlp/SkillNet/issues) to report bugs or suggest features.

---

## 📚 Citation

If you find this work useful, please kindly ⭐ the repo and cite our paper!  

```bibtex
@misc{liang2026skillnetcreateevaluateconnect,
      title={SkillNet: Create, Evaluate, and Connect AI Skills}, 
      author={Yuan Liang and Ruobin Zhong and Haoming Xu and Chen Jiang and Yi Zhong and Runnan Fang and Jia-Chen Gu and Shumin Deng and Yunzhi Yao and Mengru Wang and Shuofei Qiao and Xin Xu and Tongtong Wu and Kun Wang and Yang Liu and Zhen Bi and Jungang Lou and Yuchen Eleanor Jiang and Hangcheng Zhu and Gang Yu and Haiwen Hong and Longtao Huang and Hui Xue and Chenxi Wang and Yijun Wang and Zifei Shan and Xi Chen and Zhaopeng Tu and Feiyu Xiong and Xin Xie and Peng Zhang and Zhengke Gui and Lei Liang and Jun Zhou and Chiyu Wu and Jin Shang and Yu Gong and Junyu Lin and Changliang Xu and Hongjie Deng and Wen Zhang and Keyan Ding and Qiang Zhang and Fei Huang and Ningyu Zhang and Jeff Z. Pan and Guilin Qi and Haofen Wang and Huajun Chen},
      year={2026},
      eprint={2603.04448},
      archivePrefix={arXiv},
      primaryClass={cs.AI},
      url={https://arxiv.org/abs/2603.04448}, 
}
```
