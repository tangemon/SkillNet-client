import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_MODEL } from './creator';
import { Relationship } from './skillnet';

export interface AnalyzerConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';

const RELATIONSHIP_ANALYSIS_SYSTEM_PROMPT = `You are the SkillNet Architect.`;

const RELATIONSHIP_ANALYSIS_USER_PROMPT_TEMPLATE = `Your task is to map logical relationships between the provided skills based on their names and descriptions.

You must strictly identify ONLY the following 4 types of relationships:

1. similar_to
   - A and B perform functionally equivalent tasks (e.g., "Google Search" and "Bing Search").
   - Users can replace A with B.

2. belong_to
   - A is a sub-component or specific step within B.
   - B represents a larger workflow or agent, and A is just one part of it.
   - Direction: Child -> belong_to -> Parent.

3. compose_with
   - A and B are independent but often used together in a workflow.
   - One usually produces data that the other consumes, or they are logically paired.
   - Example: "PDF Parser" compose_with "Text Summarizer".

4. depend_on
   - A CANNOT execute without B.
   - B is a hard dependency (e.g., Environment setup, API Key loader, or a core library skill).
   - Direction: Dependent -> depend_on -> Prerequisite.

Here is the list of Skills in the user's local environment. Please analyze them and generate the relationships.

Skills List:
{skills_list}

Remember:
- Be conservative. Only create a relationship if there is a logical connection based on the name and description.
- Do not hallucinate skills not in the list.

Output Format:
Return a JSON array where each element represents a relationship with the following keys:
- source: (string) The name of the source skill (the one initiating the relationship)
- target: (string) The name of the target skill (the one receiving the relationship)
- type: (string) One of the 4 relationship types: "similar_to", "belong_to", "compose_with", "depend_on"
- reason: (string) A brief explanation of why this relationship exists based on the skill descriptions.

Output Example:
[
    {
      "source": "google_search_tool",
      "target": "bing_search_tool",
      "type": "similar_to",
      "reason": "Both provide web search capabilities and are interchangeable."
    },
    ...
]

Keep your output in the format below:
<Skill_Relationships>
your generated JSON array here
</Skill_Relationships>`;

export interface SkillMetadata {
  name: string;
  description: string;
}

export class SkillRelationshipAnalyzer {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private client: AxiosInstance;

  constructor(config: AnalyzerConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_LLM_BASE_URL;
    this.model = config.model || DEFAULT_MODEL;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      proxy: false  // 禁用代理，直接访问内部服务
    });
  }

  async analyzeLocalSkills(skillsDir: string, saveToFile: boolean = true): Promise<Relationship[]> {
    if (!fs.existsSync(skillsDir)) {
      throw new Error(`Directory not found: ${skillsDir}`);
    }

    const skillsMetadata = this.loadSkillsMetadata(skillsDir);
    if (skillsMetadata.length < 2) {
      console.warn('Not enough skills found to analyze relationships (need at least 2).');
      return [];
    }

    console.log(`Found ${skillsMetadata.length} skills. Analyzing potential connections...`);

    const relationships = await this.generateRelationshipGraph(skillsMetadata);

    if (saveToFile && relationships.length > 0) {
      const outputPath = path.join(skillsDir, 'relationships.json');
      try {
        fs.writeFileSync(outputPath, JSON.stringify(relationships, null, 2), 'utf-8');
        console.log(`Relationships saved to: ${outputPath}`);
      } catch (error: any) {
        console.error(`Failed to save relationships file: ${error.message}`);
      }
    }

    return relationships;
  }

  loadSkillsMetadata(rootDir: string): SkillMetadata[] {
    const skills: SkillMetadata[] = [];

    if (!fs.existsSync(rootDir)) {
      return skills;
    }

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(rootDir, entry.name);
        const skillName = entry.name;
        let description = 'No description provided.';

        const skillMdPath = path.join(skillPath, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          try {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            description = this._extractDescription(content);
          } catch (error) {
            console.warn(`Could not read content for ${skillName}`);
          }
        }

        skills.push({
          name: skillName,
          description: description
        });
      }
    }

    return skills;
  }

  _extractDescription(content: string): string {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fmText = frontmatterMatch[1];
      const descMatch = fmText.match(/description:\s*(.+)$/m);
      if (descMatch) {
        return descMatch[1].trim().replace(/^["']|["']$/g, '');
      }
    }

    const cleanText = content
      .replace(/^#+\s.*/gm, '')
      .replace(/```[\s\S]*?```/g, '');
    const lines = cleanText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length > 0) {
      return lines[0];
    }

    return 'No description available.';
  }

  _extractJsonFromTags(content: string, tagName: string): string {
    const startTag = `<${tagName}>`;
    const endTag = `</${tagName}>`;

    if (content.includes(startTag) && content.includes(endTag)) {
      const startIndex = content.indexOf(startTag) + startTag.length;
      const endIndex = content.indexOf(endTag);
      return content.substring(startIndex, endIndex).trim();
    }

    return content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
  }

  private async generateRelationshipGraph(skills: SkillMetadata[]): Promise<Relationship[]> {
    const skillsJson = JSON.stringify(skills, null, 2);

    const messages = [
      { role: 'system', content: RELATIONSHIP_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: RELATIONSHIP_ANALYSIS_USER_PROMPT_TEMPLATE.replace('{skills_list}', skillsJson) }
    ];

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: messages
      });

      const content = response.data.choices[0].message.content;

      const jsonStr = this._extractJsonFromTags(content, 'Skill_Relationships');

      let parsedData: any;
      try {
        parsedData = JSON.parse(jsonStr);
      } catch (error) {
        console.error('Failed to parse JSON content');
        return [];
      }

      const edges: any[] = [];
      if (Array.isArray(parsedData)) {
        edges.push(...parsedData);
      } else if (typeof parsedData === 'object' && parsedData !== null && 'relationships' in parsedData) {
        edges.push(...parsedData.relationships);
      }

      const validNames = new Set(skills.map(s => s.name));
      const validTypes = new Set(['similar_to', 'belong_to', 'compose_with', 'depend_on']);

      const validEdges: Relationship[] = [];
      for (const edge of edges) {
        if (typeof edge !== 'object' || edge === null) {
          continue;
        }

        const sourceName = edge.source;
        const targetName = edge.target;
        const relType = edge.type;

        if (
          sourceName && targetName && relType &&
          validNames.has(sourceName) &&
          validNames.has(targetName) &&
          validTypes.has(relType) &&
          sourceName !== targetName
        ) {
          validEdges.push({
            source: sourceName,
            target: targetName,
            type: relType,
            reason: edge.reason || 'No reason provided'
          });
        }
      }

      console.log(`Identified ${validEdges.length} valid relationships.`);
      return validEdges;

    } catch (error: any) {
      console.error(`Failed to analyze relationships: ${error.message}`);
      return [];
    }
  }
}

export { SkillRelationshipAnalyzer as Analyzer };
