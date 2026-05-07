import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export enum SearchMode {
  Keyword = 'keyword',
  Vector = 'vector'
}

export enum SortBy {
  Stars = 'stars',
  Recent = 'recent'
}

export interface SearchOptions {
  q: string;
  mode?: SearchMode;
  category?: string;
  limit?: number;
  page?: number;
  minStars?: number;
  sortBy?: SortBy;
  threshold?: number;
}

export interface SkillInfo {
  skillName: string;
  skillDescription: string;
  author: string;
  stars: number;
  skillUrl: string;
  category?: string;
}

export interface DownloadOptions {
  url: string;
  targetDir?: string;
}

export interface CreateOptions {
  trajectoryContent?: string;
  githubUrl?: string;
  officeFile?: string;
  prompt?: string;
  outputDir: string;
}

export interface CreateResult {
  success: boolean;
  skillPath?: string;
  message?: string;
}

export interface EvaluationDimension {
  level: string;
  reason: string;
}

export interface EvaluationResult {
  safety: EvaluationDimension;
  completeness: EvaluationDimension;
  executability: EvaluationDimension;
  maintainability: EvaluationDimension;
  costAwareness: EvaluationDimension;
}

export interface EvaluateOptions {
  target: string;
  category?: string;
  model?: string;
}

export interface AnalyzeOptions {
  skillsDir: string;
  noSave?: boolean;
  model?: string;
}

export interface Relationship {
  source: string;
  type: string;
  target: string;
}

export interface ClientConfig {
  apiKey?: string;
  /** SkillNet API 服务端地址，默认: http://api-skillnet.openkg.cn/v1 */
  skillnetUrl?: string;
  /** LLM API 端点（用于 create/evaluate/analyze），默认: https://api.openai.com/v1 */
  baseUrl?: string;
  githubToken?: string;
}

const DEFAULT_SKILLNET_URL = 'http://api-skillnet.openkg.cn/v1';
const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_DOWNLOAD_DIR = './skillnet_downloads';

export class SkillNetClient {
  private client: AxiosInstance;
  private apiKey?: string;
  private githubToken?: string;
  private llmBaseUrl: string;

  constructor(config: ClientConfig = {}) {
    const skillnetUrl = config.skillnetUrl || DEFAULT_SKILLNET_URL;
    this.llmBaseUrl = config.baseUrl || DEFAULT_LLM_BASE_URL;
    
    this.client = axios.create({
      baseURL: skillnetUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }

    if (config.githubToken) {
      this.githubToken = config.githubToken;
    }

    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      if (this.githubToken) {
        config.headers['X-GitHub-Token'] = this.githubToken;
      }
      return config;
    });
  }

  async search(options: SearchOptions): Promise<SkillInfo[]> {
    if (!options.q || options.q.trim() === '') {
      throw new Error('Search query is required');
    }

    const params: Record<string, any> = {
      q: options.q
    };

    if (options.mode) {
      params.mode = options.mode;
    } else {
      params.mode = SearchMode.Keyword;
    }

    if (options.category) {
      params.category = options.category;
    }

    if (options.limit !== undefined) {
      params.limit = Math.min(options.limit, 50);
    }

    if (options.mode === SearchMode.Keyword || !options.mode) {
      if (options.page !== undefined) {
        params.page = options.page;
      }
      if (options.minStars !== undefined) {
        params.min_stars = options.minStars;
      }
      if (options.sortBy) {
        params.sort_by = options.sortBy;
      }
    }

    if (options.mode === SearchMode.Vector) {
      if (options.threshold !== undefined) {
        params.threshold = options.threshold;
      }
    }

    try {
      const response = await this.client.get('/search', { params });
      const data = response.data;

      if (!data.success) {
        throw new Error('Search failed');
      }

      return (data.data || []).map((item: any) => ({
        skillName: item.skill_name,
        skillDescription: item.skill_description,
        author: item.author,
        stars: item.stars,
        skillUrl: item.skill_url,
        category: item.category
      }));
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async download(options: DownloadOptions): Promise<string> {
    if (!options.url || options.url.trim() === '') {
      throw new Error('URL is required');
    }

    const params: Record<string, any> = {
      url: options.url
    };

    if (options.targetDir) {
      params.target_dir = options.targetDir;
    } else {
      params.target_dir = DEFAULT_DOWNLOAD_DIR;
    }

    try {
      const response = await this.client.get('/download', { params });
      const data = response.data;

      if (!data.success) {
        throw new Error('Download failed');
      }

      return data.path;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async create(options: CreateOptions): Promise<CreateResult> {
    if (!this.apiKey) {
      throw new Error('API key is required for create operation');
    }

    const hasSource = options.trajectoryContent || options.githubUrl || options.officeFile || options.prompt;
    if (!hasSource) {
      throw new Error('At least one source (trajectoryContent, githubUrl, officeFile, or prompt) is required');
    }

    const body: Record<string, any> = {
      output_dir: options.outputDir,
      base_url: this.llmBaseUrl
    };

    if (options.trajectoryContent) {
      body.trajectory_content = options.trajectoryContent;
    }
    if (options.githubUrl) {
      body.github_url = options.githubUrl;
    }
    if (options.officeFile) {
      body.office_file = options.officeFile;
    }
    if (options.prompt) {
      body.prompt = options.prompt;
    }

    try {
      const config: AxiosRequestConfig = {};
      if (this.githubToken) {
        config.headers = { 'X-GitHub-Token': this.githubToken };
      }

      const response = await this.client.post('/create', body, config);
      const data = response.data;

      return {
        success: data.success,
        skillPath: data.skill_path,
        message: data.message
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async evaluate(options: EvaluateOptions): Promise<{ success: boolean; evaluation: EvaluationResult }> {
    if (!this.apiKey) {
      throw new Error('API key is required for evaluate operation');
    }

    if (!options.target || options.target.trim() === '') {
      throw new Error('Target is required');
    }

    const body: Record<string, any> = {
      target: options.target,
      base_url: this.llmBaseUrl
    };

    if (options.category) {
      body.category = options.category;
    }
    if (options.model) {
      body.model = options.model;
    }

    try {
      const response = await this.client.post('/evaluate', body);
      const data = response.data;

      return {
        success: data.success,
        evaluation: {
          safety: data.evaluation.safety,
          completeness: data.evaluation.completeness,
          executability: data.evaluation.executability,
          maintainability: data.evaluation.maintainability,
          costAwareness: data.evaluation.cost_awareness
        }
      };
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }

  async analyze(options: AnalyzeOptions): Promise<Relationship[]> {
    if (!this.apiKey) {
      throw new Error('API key is required for analyze operation');
    }

    if (!options.skillsDir || options.skillsDir.trim() === '') {
      throw new Error('Skills directory is required');
    }

    const body: Record<string, any> = {
      skills_dir: options.skillsDir,
      base_url: this.llmBaseUrl
    };

    if (options.noSave) {
      body.no_save = true;
    }
    if (options.model) {
      body.model = options.model;
    }

    try {
      const response = await this.client.post('/analyze', body);
      const data = response.data;

      return (data.relationships || []).map((rel: any) => ({
        source: rel.source,
        type: rel.type,
        target: rel.target
      }));
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }
}

export { SkillNetClient as default };
