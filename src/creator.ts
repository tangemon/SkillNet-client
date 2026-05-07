import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o';

const SUPPORTED_OFFICE_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt'];

const EXCLUDED_DIRS = new Set([
  'node_modules', '__pycache__', '.git --no-pager', '.venv', 'venv',
  'env', '.env', 'build', 'dist', '.pytest_cache',
  '.mypy_cache', 'htmlcov', '.tox', '.eggs'
]);

// ============================================================================
// Prompts
// ============================================================================

const CANDIDATE_METADATA_SYSTEM_PROMPT = 'You are a helpful assistant.';

const CANDIDATE_METADATA_USER_PROMPT_TEMPLATE = `Your goal is to analyze an interaction trajectory and extract **reusable Skills**.

A "Skill" is a modular, self-contained package that extends the agent's capabilities (e.g., "PDF Processor", "Market Analyzer", "Code Reviewer").

# Core Objective
1. Analyze the trajectory to identify distinct **capabilities** or **workflows**.
2. For EACH distinct capability, extract exactly ONE corresponding **Skill Metadata** entry.

*Note: Avoid over-fragmentation. If the trajectory is a coherent workflow (e.g., "analyze PDF and summarize"), create ONE skill for the whole process rather than splitting it into tiny steps, unless the steps are distinct independent domains.*

# Input Data
**Execution Trajectory:**
{trajectory}

# Step 1: Skill Identification
Identify skills that are:
- **Reusable**: Useful for future, similar requests.
- **Modular**: Self-contained with clear inputs and outputs.
- **Domain Specific**: Provides specialized knowledge or workflow logic.

# Step 2: Metadata Extraction Rules
For EACH identified skill, generate metadata with:

### \`name\` requirements:
- **kebab-case** (e.g., \`financial-report-generator\`, \`code-refactor-tool\`).
- Concise but descriptive.

### \`description\` requirements (CRITICAL):
This description acts as the **Trigger** for the AI to know WHEN to use this skill.
It must be a **When-To-Use** statement containing:
1. **Context**: The specific situation or user intent (e.g., "When the user asks to analyze a PDF...").
2. **Capabilities**: What the skill provides (e.g., "...extracts text and summarizes financial metrics").
3. **Triggers**: Specific keywords or file types associated with this skill.

# Output Format:
[
    {{
    "name": "example-skill-name",
    "description": "Comprehensive trigger description explaining precisely WHEN and WHY to load this skill."
    }},
    ...
]

Keep your output in the format below:
<Skill_Candidate_Metadata>
your generated candidate metadata list in JSON format here
</Skill_Candidate_Metadata>`;

const SKILL_CONTENT_SYSTEM_PROMPT = 'You are an expert Technical Writer specializing in creating SKILL for AI agents.';

const SKILL_CONTENT_USER_PROMPT_TEMPLATE = `Your task is to generate a **skill package** based on the provided execution trajectory, skill name, and skill description.
This includes the main \`SKILL.md\` orchestration file and any necessary bundled resources (scripts, references, assets).

# Input Data
1. **Trajectory:** {trajectory}
2. **Skill Name:** {name}
3. **Skill Description:** {description}

# Skill Structure Standard
You must output the skill using the following directory structure:

\`\`\`text
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
\`\`\`

# Core Design Principles
1. Context is a Public Good: Be concise. Only add context in SKILL.md that is essential.
2. Progressive Disclosure:
- Keep SKILL.md lean.
- Offload heavy documentation/schemas to references/.
- Offload repeatable, deterministic logic to scripts/.
3. Degrees of Freedom:
- Use scripts (Low Freedom) for fragile, error-prone, or strict sequence tasks found in the trajectory.
- Use text instructions (High Freedom) for creative decisions.

# Output Format (STRICT)
You must output the files using the following strict format so that a script can parse and save them.
For every file (including SKILL.md, scripts, references, etc.), use this exact pattern:

## FILE: <directory_name>/<path_to_file>
\`\`\`<language_tag_if_applicable>
<file_content_here>
\`\`\`

**Example Output:**

## FILE: pdf-processor/SKILL.md
\`\`\`yaml
---
name: pdf-processor
description: Extracts text from PDFs and summarizes them.
---
# Instructions
1. Run the extraction script.
2. Summarize the output.
\`\`\`

## FILE: pdf-processor/scripts/extract.py
\`\`\`python
import pdfplumber
# ... code ...
\`\`\`

## FILE: pdf-processor/references/api_docs.md
\`\`\`markdown
# API Documentation
...
\`\`\`

Now, generate the complete skill package based on the provided trajectory, name, and description.`;

const GITHUB_SKILL_SYSTEM_PROMPT = `You are an expert Technical Writer specializing in creating Skills for AI agents.
Your task is to analyze a GitHub repository and generate a comprehensive skill package that captures the repository's functionality and usage patterns.

CRITICAL REQUIREMENTS:
1. Generate COMPLETE content - do not truncate or abbreviate sections
2. Include ALL installation steps with actual commands from README
3. Extract CONCRETE code examples from README - copy them exactly, don't invent new ones
4. List specific models, APIs, or tools mentioned in the repository
5. For scripts/: Generate REAL, RUNNABLE Python code that demonstrates library usage
6. For references/: Generate DETAILED API documentation with actual function signatures
7. Follow the SkillNet skill structure standard exactly
8. Output files in parseable format with ## FILE: markers

SCRIPT QUALITY REQUIREMENTS:
- Scripts must be self-contained and runnable (no os.system('conda activate'))
- Scripts should demonstrate actual library API usage, not shell command wrappers
- Include proper imports, error handling, and docstrings
- If the library requires specific data, use placeholder paths with clear comments

REFERENCE QUALITY REQUIREMENTS:
- API references must include actual function signatures from code analysis
- Include parameter types, return types, and brief descriptions
- Organize by module/class hierarchy
- Reference the source file locations

Your output will be parsed by a script, so maintain strict formatting.`;

const GITHUB_SKILL_USER_PROMPT_TEMPLATE = `Your task is to generate a complete skill package from the provided GitHub repository information.
This includes the main \`SKILL.md\` orchestration file and any necessary bundled resources.

# Input Data: GitHub Repository

## Repository Info
- **Name:** {repo_name}
- **URL:** {repo_url}
- **Description:** {repo_description}
- **Primary Language:** {language}
- **Languages Breakdown:** {languages_breakdown}
- **Stars:** {stars}
- **Topics:** {topics}

## README Content
{readme_content}

## File Structure
{file_tree}

## Code Analysis Summary
{code_summary}

# Skill Structure Standard
You must output the skill using the following directory structure:

\`\`\`text
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (required)
    ├── scripts/          - Executable Python code demonstrating library usage
    └── references/       - API documentation with function signatures
\`\`\`

# SKILL.md Content Requirements (MUST INCLUDE ALL)

## 1. YAML Frontmatter (REQUIRED)
\`\`\`yaml
---
name: skill-name-in-kebab-case
description: A when-to-use trigger statement explaining when this skill should be activated
---
\`\`\`

## 2. When to Use Section (REQUIRED)
Clear description of scenarios where this skill should be activated. Include:
- Primary use cases
- Types of tasks it handles
- Keywords that should trigger this skill

## 3. Quick Reference Section (REQUIRED)
- Official documentation links
- Demo/playground URLs if available
- Key resources and references

## 4. Installation/Setup Section (REQUIRED - WITH ACTUAL COMMANDS)
Include complete installation commands exactly as shown in README:
- Prerequisites (Python version, system requirements)
- pip install commands
- Docker commands if available
- Environment setup steps

## 5. Core Features Section (REQUIRED)
List the main features/capabilities:
- Feature 1: Description
- Feature 2: Description
- Include any sub-modules or specialized tools

## 6. Usage Examples Section (REQUIRED - EXTRACT FROM README)
Include ACTUAL code examples from the README:
- Quick start code
- Common usage patterns
- Command-line examples

## 7. Key APIs/Models Section (REQUIRED)
List specific models, classes, or APIs mentioned:
- Model names (e.g., specific neural network architectures)
- API endpoints or function signatures
- Configuration options

## 8. Common Patterns & Best Practices (OPTIONAL)
Tips for effective usage

# Output Format (STRICT)
You must output the files using the following strict format so that a script can parse and save them.
For every file, use this exact pattern:

## FILE: {{actual-skill-name}}/{{path_to_file}}
\`\`\`` + '`' + `{{language_tag}}
{{file_content_here}}
\`\`\`

**CRITICAL PATH RULES:**
- Replace \`{{actual-skill-name}}\` with the ACTUAL kebab-case skill name derived from the repository (e.g., "openai-python", "pandas", "requests")
- DO NOT use placeholder text like "skill-name" literally
 use "openai-python"
 use "requests"

**IMPORTANT:**
- SKILL.md MUST use \`\`\`markdown as language tag and include ALL content (frontmatter + full body) inside ONE code block
- Generate COMPLETE files, do not use "..." or "[content continues]"
- SKILL.md should be comprehensive (at least 100+ lines)
- scripts/: At least one RUNNABLE Python script with actual library API usage
- references/: At least one DETAILED API reference with function signatures

Now, generate the complete skill package based on the provided GitHub repository information.
Focus on creating a practical, comprehensive skill that an AI agent can use to work with this repository.
DO NOT truncate content - include all relevant information from the README.
SCRIPTS must demonstrate actual Python API usage, not shell command wrappers.
REFERENCES must include actual function signatures and parameters.`;

const OFFICE_SKILL_SYSTEM_PROMPT = `You are an expert Technical Writer specializing in creating Skills for AI agents.
Your task is to analyze text content extracted from an office document (PDF, PPT, or Word) and convert it into a structured skill package.

CRITICAL REQUIREMENTS:
1. Identify the core knowledge, procedures, or guidelines from the document
2. Structure the content as a reusable AI skill
3. Extract actionable instructions that an AI agent can follow
4. Preserve key information while organizing it into the skill format
5. Generate appropriate scripts if the document describes code procedures
6. Create reference files for supplementary information

Output files in parseable format with ## FILE: markers.`;

const OFFICE_SKILL_USER_PROMPT_TEMPLATE = `Your task is to convert the following document content into a structured skill package.

# Input: Document Content

**Source File:** {filename}
**File Type:** {file_type}

## Extracted Text Content:
{document_content}

# Skill Structure Standard
You must output the skill using the following directory structure:

\`\`\`text
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional but recommended)
    ├── scripts/          - Executable code if applicable
    └── references/       - Additional documentation or data
\`\`\`

# Content Analysis Guidelines

1. **Identify the Skill Name**: Derive from document title or main topic
2. **Create Description**: Write a "when-to-use" trigger statement
3. **Extract Procedures**: Convert step-by-step instructions into actionable format
4. **Identify Code/Commands**: If the document contains code, create scripts/
5. **Supplementary Info**: Move detailed references to references/

# SKILL.md Requirements

## YAML Frontmatter (REQUIRED)
\`\`\`yaml
---
name: skill-name-in-kebab-case
description: When-to-use trigger statement explaining when this skill should be activated
---
\`\`\`

## Content Sections to Include:
- **Overview**: Brief summary of what this skill covers
- **When to Use**: Clear triggers for skill activation
- **Prerequisites**: Any required knowledge, tools, or setup
- **Instructions/Procedures**: Main actionable content from document
- **Examples**: Practical examples if available in source
- **References**: Links to additional resources mentioned

# Output Format (STRICT)
For every file, use this exact pattern:

## FILE: <skill-name>/<path_to_file>
\`\`\`<language_tag>
<file_content_here>
\`\`\`

Generate a complete, practical skill package from this document content.
Focus on making the knowledge actionable for an AI agent.`;

const PROMPT_SKILL_SYSTEM_PROMPT = `You are an expert Technical Writer specializing in creating Skills for AI agents.
Your task is to generate a complete skill package based on the user's description and requirements.

CRITICAL REQUIREMENTS:
1. Generate a comprehensive skill based on user's input
2. Create practical, actionable instructions
3. Include example scripts if the skill involves code
4. Add reference documentation where helpful
5. Make the skill reusable and well-structured

Think creatively about what resources would make this skill most useful.
Output files in parseable format with ## FILE: markers.`;

const PROMPT_SKILL_USER_PROMPT_TEMPLATE = `Your task is to generate a complete skill package based on the following user description.

# User's Skill Request:
{user_input}

# Skill Structure Standard
You must output the skill using the following directory structure:

\`\`\`text
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional but recommended)
    ├── scripts/          - Executable code demonstrating the skill
    └── references/       - API docs, templates, or reference material
\`\`\`

# Generation Guidelines

Based on the user's description, you should:

1. **Determine Skill Name**: Create a kebab-case name reflecting the skill's purpose
2. **Write Description**: Create a "when-to-use" trigger statement
3. **Design Instructions**: Write clear, step-by-step procedures
4. **Add Scripts**: If applicable, create Python scripts demonstrating the skill
5. **Include References**: Add any helpful reference documentation

# SKILL.md Requirements

## YAML Frontmatter (REQUIRED)
\`\`\`yaml
---
name: skill-name-in-kebab-case
description: When-to-use trigger statement explaining when this skill should be activated
---
\`\`\`

## Recommended Sections:
- **Overview**: What this skill does
- **When to Use**: Clear triggers for skill activation
- **Prerequisites**: Required tools, libraries, or knowledge
- **Quick Start**: Fastest way to use this skill
- **Detailed Instructions**: Comprehensive step-by-step guide
- **Examples**: Practical usage examples
- **Tips & Best Practices**: Common pitfalls and recommendations
- **Troubleshooting**: Common issues and solutions

# Output Format (STRICT)
For every file, use this exact pattern:

## FILE: <skill-name>/<path_to_file>
\`\`\`<language_tag>
<file_content_here>
\`\`\`

Now, generate a complete, high-quality skill package based on the user's request.
Be comprehensive and practical - create a skill that an AI agent would find genuinely useful.`;

// ============================================================================
// Interfaces
// ============================================================================

export interface CreatorConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  githubToken?: string;
}

export interface CreateFromTrajectoryOptions {
  trajectory: string;
  outputDir: string;
  model?: string;
}

export interface CreateFromPromptOptions {
  prompt: string;
  outputDir: string;
  model?: string;
}

export interface CreateFromOfficeOptions {
  filePath: string;
  outputDir: string;
  model?: string;
}

export interface CreateFromGitHubOptions {
  githubUrl: string;
  outputDir: string;
  model?: string;
  maxFiles?: number;
}

export interface CreateResult {
  success: boolean;
  skillPaths: string[];
  message?: string;
}

export interface SkillCandidate {
  name: string;
  description: string;
}

export interface GitHubRepoData {
  metadata: {
    name: string;
    full_name: string;
    description: string | null;
    stars: number;
    language: string | null;
    topics: string[];
    default_branch: string;
  };
  readme: string | null;
  fileTree: Array<{ path: string; type: string; size?: number }>;
  languages: Record<string, number>;
  codeAnalysis: {
    files_analyzed: number;
    total_classes: number;
    total_functions: number;
    files: Array<{
      file: string;
      classes: Array<{ name: string; docstring?: string }>;
      functions: Array<{ name: string; parameters: string[]; docstring?: string }>;
    }>;
  };
  github_url: string;
}

// ============================================================================
// Creator Class
// ============================================================================

export class Creator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private githubToken?: string;
  private httpClient: AxiosInstance;

  constructor(config: CreatorConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_LLM_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;
    this.githubToken = config.githubToken;

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      proxy: false  // 禁用代理，直接访问内部服务
    });
  }

  private async callLLM(messages: Array<{ role: string; content: string }>): Promise<string> {
    try {
      const response = await this.httpClient.post('/chat/completions', {
        model: this.model,
        messages
      });
      return response.data.choices[0]?.message?.content || '';
    } catch (error: any) {
      if (error.response?.data?.error?.message) {
        throw new Error(`LLM Error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  private parseCandidateMetadata(llmOutput: string): SkillCandidate[] {
    if (!llmOutput || !llmOutput.trim()) {
      return [];
    }

    try {
      let jsonStr = llmOutput;
      
      if (llmOutput.includes('<Skill_Candidate_Metadata>')) {
        const parts = llmOutput.split('<Skill_Candidate_Metadata>');
        if (parts.length > 1) {
          jsonStr = parts[1].split('</Skill_Candidate_Metadata>')[0];
        }
      }

      jsonStr = jsonStr.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item.name && item.description);
      }
      
      return [];
    } catch (error) {
      console.error('Failed to parse metadata JSON:', error);
      return [];
    }
  }

  private saveSkillFiles(llmOutput: string, outputBaseDir: string): string[] {
    const createdFiles: string[] = [];
    const filePattern = /##\s*FILE:\s*(.+?)\s*\n```(?:\w*)\n(.*?)```/gs;
    
    let match;
    while ((match = filePattern.exec(llmOutput)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      const fullPath = path.join(outputBaseDir, filePath);
      
      try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf-8');
        createdFiles.push(fullPath);
      } catch (error) {
        console.error(`Failed to write file ${fullPath}:`, error);
      }
    }
    
    return createdFiles;
  }

  private extractSkillDirs(createdFiles: string[], outputDir: string): string[] {
    const skillDirs = new Set<string>();
    
    for (const filePath of createdFiles) {
      const relPath = path.relative(outputDir, filePath);
      const parts = relPath.split(path.sep);
      if (parts.length > 0) {
        skillDirs.add(parts[0]);
      }
    }
    
    return Array.from(skillDirs);
  }

  async createFromTrajectory(options: CreateFromTrajectoryOptions): Promise<CreateResult> {
    const { trajectory, outputDir, model } = options;

    if (!trajectory || trajectory.trim() === '') {
      throw new Error('Trajectory content is required');
    }

    if (!outputDir || outputDir.trim() === '') {
      throw new Error('Output directory is required');
    }

    const effectiveModel = model || this.model;

    try {
      const metadataMessages = [
        { role: 'system', content: CANDIDATE_METADATA_SYSTEM_PROMPT },
        { role: 'user', content: CANDIDATE_METADATA_USER_PROMPT_TEMPLATE.replace('{trajectory}', trajectory) }
      ];

      const metadataResponse = await this.callLLM(metadataMessages);
      const candidates = this.parseCandidateMetadata(metadataResponse);

      if (candidates.length === 0) {
        return { success: true, skillPaths: [], message: 'No skills identified in trajectory' };
      }

      const createdFiles: string[] = [];

      for (const candidate of candidates) {
        const contentMessages = [
          { role: 'system', content: SKILL_CONTENT_SYSTEM_PROMPT },
          { role: 'user', content: SKILL_CONTENT_USER_PROMPT_TEMPLATE
            .replace('{trajectory}', trajectory)
            .replace('{name}', candidate.name)
            .replace('{description}', candidate.description)
          }
        ];

        const contentResponse = await this.callLLM(contentMessages);
        const files = this.saveSkillFiles(contentResponse, outputDir);
        createdFiles.push(...files);
      }

      const skillDirs = this.extractSkillDirs(createdFiles, outputDir);
      
      return {
        success: true,
        skillPaths: skillDirs,
        message: `Created ${skillDirs.length} skill(s)`
      };
    } catch (error: any) {
      return {
        success: false,
        skillPaths: [],
        message: error.message || 'Failed to create skill from trajectory'
      };
    }
  }

  async createFromPrompt(options: CreateFromPromptOptions): Promise<CreateResult> {
    const { prompt, outputDir, model } = options;

    if (!prompt || prompt.trim() === '') {
      throw new Error('Prompt is required');
    }

    if (!outputDir || outputDir.trim() === '') {
      throw new Error('Output directory is required');
    }

    const effectiveModel = model || this.model;

    try {
      const messages = [
        { role: 'system', content: PROMPT_SKILL_SYSTEM_PROMPT },
        { role: 'user', content: PROMPT_SKILL_USER_PROMPT_TEMPLATE.replace('{user_input}', prompt) }
      ];

      const response = await this.callLLM(messages);
      
      if (!response || !response.trim()) {
        return { success: true, skillPaths: [], message: 'LLM returned empty response' };
      }

      const createdFiles = this.saveSkillFiles(response, outputDir);
      const skillDirs = this.extractSkillDirs(createdFiles, outputDir);

      return {
        success: true,
        skillPaths: skillDirs,
        message: `Created ${skillDirs.length} skill(s)`
      };
    } catch (error: any) {
      return {
        success: false,
        skillPaths: [],
        message: error.message || 'Failed to create skill from prompt'
      };
    }
  }

  async createFromOffice(options: CreateFromOfficeOptions): Promise<CreateResult> {
    const { filePath, outputDir, model } = options;

    if (!filePath || filePath.trim() === '') {
      throw new Error('File path is required');
    }

    if (!outputDir || outputDir.trim() === '') {
      throw new Error('Output directory is required');
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_OFFICE_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}. Supported: ${SUPPORTED_OFFICE_EXTENSIONS.join(', ')}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const effectiveModel = model || this.model;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const fileType = ext === '.pdf' ? 'PDF Document' 
        : ext.includes('doc') ? 'Word Document' 
        : 'PowerPoint Presentation';

      const messages = [
        { role: 'system', content: OFFICE_SKILL_SYSTEM_PROMPT },
        { role: 'user', content: OFFICE_SKILL_USER_PROMPT_TEMPLATE
          .replace('{filename}', fileName)
          .replace('{file_type}', fileType)
          .replace('{document_content}', content.slice(0, 50000))
        }
      ];

      const response = await this.callLLM(messages);
      
      if (!response || !response.trim()) {
        return { success: true, skillPaths: [], message: 'LLM returned empty response' };
      }

      const createdFiles = this.saveSkillFiles(response, outputDir);
      const skillDirs = this.extractSkillDirs(createdFiles, outputDir);

      return {
        success: true,
        skillPaths: skillDirs,
        message: `Created ${skillDirs.length} skill(s)`
      };
    } catch (error: any) {
      return {
        success: false,
        skillPaths: [],
        message: error.message || 'Failed to create skill from office document'
      };
    }
  }

  async createFromGitHub(options: CreateFromGitHubOptions): Promise<CreateResult> {
    const { githubUrl, outputDir, model, maxFiles = 50 } = options;

    if (!githubUrl || githubUrl.trim() === '') {
      throw new Error('GitHub URL is required');
    }

    if (!outputDir || outputDir.trim() === '') {
      throw new Error('Output directory is required');
    }

    const effectiveModel = model || this.model;

    try {
      const repoData = await this.fetchGitHubRepoData(githubUrl, maxFiles);
      
      if (!repoData) {
        throw new Error('Failed to fetch repository data');
      }

      const skillContent = await this.generateGitHubSkillContent(repoData);
      
      if (!skillContent) {
        throw new Error('Failed to generate skill content');
      }

      const createdFiles = this.saveSkillFiles(skillContent, outputDir);
      const skillDirs = this.extractSkillDirs(createdFiles, outputDir);

      const skillName = repoData.metadata.name.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
      if (skillDirs.length === 0) {
        skillDirs.push(skillName);
      }

      return {
        success: true,
        skillPaths: skillDirs,
        message: `Created ${skillDirs.length} skill(s) from GitHub repository`
      };
    } catch (error: any) {
      return {
        success: false,
        skillPaths: [],
        message: error.message || 'Failed to create skill from GitHub'
      };
    }
  }

  private parseGitHubUrl(url: string): { owner: string; repo: string; branch: string; path: string } {
    url = url.replace(/\.git$/, '').replace(/\/$/, '');
    
    const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!githubMatch) {
      throw new Error('Invalid GitHub URL');
    }

    const owner = githubMatch[1];
    const repo = githubMatch[2].split('/')[0];
    let branch = 'main';
    let filePath = '';

    const treeMatch = url.match(/github\.com\/[^\/]+\/[^\/]+\/tree\/([^\/]+)\/(.*)/);
    if (treeMatch) {
      branch = treeMatch[1];
      filePath = treeMatch[2];
    }

    return { owner, repo, branch, path: filePath };
  }

  private async fetchGitHubRepoData(githubUrl: string, maxFiles: number): Promise<GitHubRepoData | null> {
    const { owner, repo, branch } = this.parseGitHubUrl(githubUrl);
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SkillNet-Creator/1.0'
    };
    
    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    try {
      const [metadataRes, readmeRes, treeRes, langRes] = await Promise.all([
        this.httpClient.get(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
        this.fetchReadme(owner, repo, branch),
        this.fetchFileTree(owner, repo, branch),
        this.httpClient.get(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers })
      ]);

      const metadata = metadataRes.data;
      const codeAnalysis = this.analyzeCodeFiles(treeRes.data || [], maxFiles);

      return {
        metadata: {
          name: metadata.name,
          full_name: metadata.full_name,
          description: metadata.description,
          stars: metadata.stargazers_count || 0,
          language: metadata.language,
          topics: metadata.topics || [],
          default_branch: metadata.default_branch || 'main'
        },
        readme: readmeRes,
        fileTree: treeRes.data || [],
        languages: langRes.data || {},
        codeAnalysis,
        github_url: `https://github.com/${owner}/${repo}`
      };
    } catch (error) {
      console.error('Failed to fetch GitHub repository data:', error);
      return null;
    }
  }

  private async fetchReadme(owner: string, repo: string, branch: string): Promise<string | null> {
    const readmeNames = ['README.md', 'README.rst', 'README.txt', 'README'];
    
    for (const readmeName of readmeNames) {
      try {
        const response = await axios.get(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readmeName}`,
          { timeout: 10000 }
        );
        if (response.status === 200) {
          return response.data;
        }
      } catch {
        continue;
      }
    }
    
    return null;
  }

  private async fetchFileTree(owner: string, repo: string, branch: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (this.githubToken) {
        headers['Authorization'] = `token ${this.githubToken}`;
      }
      
      const response = await this.httpClient.get(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers }
      );
      
      const items = response.data?.tree || [];
      return {
        data: items.filter((item: any) => {
          const itemPath = item.path || '';
          return !Array.from(EXCLUDED_DIRS).some(excluded => itemPath.includes(excluded));
        })
      };
    } catch (error) {
      console.error('Failed to fetch file tree:', error);
      return { data: [] };
    }
  }

  private analyzeCodeFiles(fileTree: Array<{ path: string; type: string }>, maxFiles: number): GitHubRepoData['codeAnalysis'] {
    const codeExtensions = ['.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.go', '.c', '.cpp', '.rs'];
    
    const codeFiles = fileTree
      .filter(f => f.type === 'blob')
      .filter(f => codeExtensions.some(ext => f.path.endsWith(ext)))
      .slice(0, maxFiles);

    const files: GitHubRepoData['codeAnalysis']['files'] = [];
    let totalClasses = 0;
    let totalFunctions = 0;

    for (const file of codeFiles) {
      const ext = path.extname(file.path);
      const functions: Array<{ name: string; parameters: string[]; docstring?: string }> = [];
      const classes: Array<{ name: string; docstring?: string }> = [];

      if (ext === '.py') {
        const funcMatches = file.path.matchAll(/def\s+(\w+)\s*\(([^)]*)\)/g);
        for (const match of funcMatches) {
          const params = match[2].split(',').map(p => p.trim()).filter(p => p);
          functions.push({ name: match[1], parameters: params });
        }

        const classMatches = file.path.matchAll(/class\s+(\w+)/g);
        for (const match of classMatches) {
          classes.push({ name: match[1] });
        }
      }

      totalFunctions += functions.length;
      totalClasses += classes.length;

      if (functions.length > 0 || classes.length > 0) {
        files.push({
          file: file.path,
          classes,
          functions
        });
      }
    }

    return {
      files_analyzed: files.length,
      total_classes: totalClasses,
      total_functions: totalFunctions,
      files
    };
  }

  private async generateGitHubSkillContent(repoData: GitHubRepoData): Promise<string | null> {
    const { metadata, readme, fileTree, languages, codeAnalysis } = repoData;

    const codeSummary = this.buildCodeSummary(codeAnalysis);
    const fileTreeStr = this.formatFileTree(fileTree);
    
    const langStr = Object.entries(languages)
      .slice(0, 5)
      .map(([lang, pct]) => `${lang}: ${pct}%`)
      .join(', ');

    const readmeContent = readme || 'No README available';
    const readmeTruncated = readmeContent.slice(0, 15000);

    const messages = [
      { role: 'system', content: GITHUB_SKILL_SYSTEM_PROMPT },
      { role: 'user', content: GITHUB_SKILL_USER_PROMPT_TEMPLATE
        .replace('{repo_name}', metadata.full_name)
        .replace('{repo_url}', repoData.github_url)
        .replace('{repo_description}', metadata.description || 'No description available')
        .replace('{language}', metadata.language || 'Unknown')
        .replace('{languages_breakdown}', langStr || 'N/A')
        .replace('{stars}', String(metadata.stars))
        .replace('{topics}', metadata.topics.join(', ') || 'None')
        .replace('{readme_content}', readmeTruncated)
        .replace('{file_tree}', fileTreeStr)
        .replace('{code_summary}', codeSummary)
      }
    ];

    try {
      return await this.callLLM(messages);
    } catch (error) {
      console.error('Failed to generate skill content:', error);
      return null;
    }
  }

  private buildCodeSummary(codeAnalysis: GitHubRepoData['codeAnalysis']): string {
    if (!codeAnalysis.files.length) {
      return 'No code analysis available.';
    }

    const lines: string[] = [
      `Analyzed ${codeAnalysis.files_analyzed} code files:`,
      `- Total Classes: ${codeAnalysis.total_classes}`,
      `- Total Functions: ${codeAnalysis.total_functions}`,
      '',
      'Key components found:'
    ];

    const maxLines = 5 + codeAnalysis.files.length * 4;
    for (const fileData of codeAnalysis.files.slice(0, 5)) {
      for (const cls of fileData.classes.slice(0, 3)) {
        lines.push(`- Class \`${cls.name}\` in ${fileData.file}`);
      }
      for (const func of fileData.functions.slice(0, 3)) {
        const params = func.parameters.slice(0, 3).join(', ');
        lines.push(`- Function \`${func.name}(${params})\` in ${fileData.file}`);
      }
    }

    return lines.slice(0, maxLines).join('\n');
  }

  private formatFileTree(fileTree: Array<{ path: string; type: string }>): string {
    if (!fileTree.length) {
      return 'No file tree available.';
    }

    const lines: string[] = [];
    for (const item of fileTree.slice(0, 50)) {
      const icon = item.type === 'tree' ? '[DIR]' : '[FILE]';
      lines.push(`${icon} ${item.path}`);
    }

    if (fileTree.length > 50) {
      lines.push(`... and ${fileTree.length - 50} more files`);
    }

    return lines.join('\n');
  }
}
