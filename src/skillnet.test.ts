import axios from 'axios';
import { SkillNetClient, SearchMode, SortBy, EvaluationResult, Relationship } from './skillnet';

const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn((successFn: any) => successFn({
        headers: {}
      }))
    }
  }
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  get: jest.fn(),
  post: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SkillNetClient', () => {
  let client: SkillNetClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
    client = new SkillNetClient();
  });

  describe('Constructor', () => {
    it('should create client with default configuration', () => {
      const defaultClient = new SkillNetClient();
      expect(defaultClient).toBeInstanceOf(SkillNetClient);
    });

    it('should create client with apiKey', () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test-key' });
      expect(clientWithKey).toBeInstanceOf(SkillNetClient);
    });

    it('should create client with custom LLM baseUrl', () => {
      const clientWithUrl = new SkillNetClient({ 
        baseUrl: 'https://custom.llm.api.com/v1' 
      });
      expect(clientWithUrl).toBeInstanceOf(SkillNetClient);
    });

    it('should create client with custom SkillNet URL', () => {
      const clientWithUrl = new SkillNetClient({ 
        skillnetUrl: 'https://custom.skillnet.api.com/v1' 
      });
      expect(clientWithUrl).toBeInstanceOf(SkillNetClient);
    });

    it('should create client with githubToken', () => {
      const clientWithToken = new SkillNetClient({ 
        githubToken: 'ghp_test_token' 
      });
      expect(clientWithToken).toBeInstanceOf(SkillNetClient);
    });

    it('should create client with all options', () => {
      const fullClient = new SkillNetClient({
        apiKey: 'sk-test',
        baseUrl: 'https://custom.api.com',
        githubToken: 'ghp_test'
      });
      expect(fullClient).toBeInstanceOf(SkillNetClient);
    });
  });

  describe('Search', () => {
    const mockSearchResponse = {
      data: [
        {
          skill_name: 'pdf-extractor-v1',
          skill_description: 'Extracts text and tables from PDF documents.',
          author: 'openkg-team',
          stars: 128,
          skill_url: 'https://github.com/openkg-team/pdf-extractor',
          category: 'Productivity'
        }
      ],
      meta: { query: 'pdf', mode: 'keyword', total: 1, limit: 10 },
      success: true
    };

    it('should search skills with keyword mode by default', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      const results = await client.search({ q: 'pdf' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'pdf',
            mode: 'keyword'
          })
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].skillName).toBe('pdf-extractor-v1');
      expect(results[0].stars).toBe(128);
    });

    it('should search skills with vector mode for semantic search', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ 
        q: 'analyze financial PDF reports', 
        mode: SearchMode.Vector,
        threshold: 0.85 
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'analyze financial PDF reports',
            mode: 'vector',
            threshold: 0.85
          })
        })
      );
    });

    it('should filter by category', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ q: 'pdf', category: 'Development' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            category: 'Development'
          })
        })
      );
    });

    it('should respect limit parameter', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ q: 'pdf', limit: 5 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            limit: 5
          })
        })
      );
    });

    it('should support pagination in keyword mode', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ q: 'pdf', page: 2 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            page: 2
          })
        })
      );
    });

    it('should filter by minimum stars', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ q: 'pdf', minStars: 10 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            min_stars: 10
          })
        })
      );
    });

    it('should sort by recent when specified', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ data: mockSearchResponse });

      await client.search({ q: 'pdf', sortBy: SortBy.Recent });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/search',
        expect.objectContaining({
          params: expect.objectContaining({
            sort_by: 'recent'
          })
        })
      );
    });

    it('should handle empty results', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({
        data: { data: [], meta: { query: 'nonexistent', mode: 'keyword', total: 0, limit: 10 }, success: true }
      });

      const results = await client.search({ q: 'nonexistent' });
      expect(results).toHaveLength(0);
    });

    it('should throw error on API failure', async () => {
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.search({ q: 'pdf' })).rejects.toThrow('Network error');
    });

    it('should throw error when q parameter is missing', async () => {
      await expect(client.search({ q: '' })).rejects.toThrow('Search query is required');
    });
  });

  describe('Download', () => {
    it('should download skill from GitHub URL', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ 
        data: { success: true, path: './my_skills/pdf-extractor' } 
      });

      const path = await client.download({
        url: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
        targetDir: './my_skills'
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/download',
        expect.objectContaining({
          params: expect.objectContaining({
            url: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
            target_dir: './my_skills'
          })
        })
      );
      expect(path).toBe('./my_skills/pdf-extractor');
    });

    it('should use default target directory when not specified', async () => {
      mockAxiosInstance.get = jest.fn().mockResolvedValue({ 
        data: { success: true, path: './skillnet_downloads/pdf-extractor' } 
      });

      await client.download({
        url: 'https://github.com/test/repo'
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/download',
        expect.objectContaining({
          params: expect.objectContaining({
            target_dir: './skillnet_downloads'
          })
        })
      );
    });

    it('should throw error when URL is missing', async () => {
      await expect(client.download({ url: '' })).rejects.toThrow('URL is required');
    });

    it('should throw error on download failure', async () => {
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('Download failed'));

      await expect(client.download({ url: 'https://github.com/test/repo' }))
        .rejects.toThrow('Download failed');
    });
  });

  describe('Create', () => {
    const mockCreateResponse = {
      success: true,
      skill_path: './skills/web-scraper',
      message: 'Skill created successfully'
    };

    it('should require apiKey for create operation', async () => {
      await expect(client.create({ 
        trajectoryContent: 'User: test\nAgent: done',
        outputDir: './skills'
      })).rejects.toThrow('API key is required for create operation');
    });

    it('should create skill from trajectory content', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockCreateResponse });

      const result = await clientWithKey.create({
        trajectoryContent: 'User: rename .jpg to .png\nAgent: Done.',
        outputDir: './skills'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/create',
        expect.objectContaining({
          trajectory_content: 'User: rename .jpg to .png\nAgent: Done.'
        }),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.skillPath).toBe('./skills/web-scraper');
    });

    it('should create skill from GitHub URL', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockCreateResponse });

      await clientWithKey.create({
        githubUrl: 'https://github.com/zjunlp/DeepKE',
        outputDir: './skills'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/create',
        expect.objectContaining({
          github_url: 'https://github.com/zjunlp/DeepKE'
        }),
        expect.any(Object)
      );
    });

    it('should create skill from office file', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockCreateResponse });

      await clientWithKey.create({
        officeFile: './guide.pdf',
        outputDir: './skills'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/create',
        expect.objectContaining({
          office_file: './guide.pdf'
        }),
        expect.any(Object)
      );
    });

    it('should create skill from prompt', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockCreateResponse });

      await clientWithKey.create({
        prompt: 'A skill for web scraping article titles',
        outputDir: './skills'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/create',
        expect.objectContaining({
          prompt: 'A skill for web scraping article titles'
        }),
        expect.any(Object)
      );
    });

    it('should throw error when no source is provided', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockCreateResponse });

      await expect(clientWithKey.create({ outputDir: './skills' }))
        .rejects.toThrow('At least one source (trajectoryContent, githubUrl, officeFile, or prompt) is required');
    });

    it('should throw error on create failure', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Create failed'));

      await expect(clientWithKey.create({ 
        prompt: 'test', 
        outputDir: './skills' 
      })).rejects.toThrow('Create failed');
    });
  });

  describe('Evaluate', () => {
    const mockEvaluateResponse = {
      success: true,
      evaluation: {
        safety: { level: 'Good', reason: 'No harmful content detected' },
        completeness: { level: 'Excellent', reason: 'All required components present' },
        executability: { level: 'Good', reason: 'Code is executable' },
        maintainability: { level: 'Fair', reason: 'Could use better documentation' },
        cost_awareness: { level: 'Good', reason: 'API usage is documented' }
      }
    };

    it('should require apiKey for evaluate operation', async () => {
      await expect(client.evaluate({ 
        target: 'https://github.com/test/skill' 
      })).rejects.toThrow('API key is required for evaluate operation');
    });

    it('should evaluate skill from GitHub URL', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockEvaluateResponse });

      const result = await clientWithKey.evaluate({
        target: 'https://github.com/anthropics/skills/tree/main/skills/algorithmic-art'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/evaluate',
        expect.objectContaining({
          target: 'https://github.com/anthropics/skills/tree/main/skills/algorithmic-art'
        })
      );
      expect(result.success).toBe(true);
      expect(result.evaluation).toHaveProperty('safety');
      expect(result.evaluation).toHaveProperty('completeness');
      expect(result.evaluation).toHaveProperty('executability');
      expect(result.evaluation).toHaveProperty('maintainability');
      expect(result.evaluation).toHaveProperty('costAwareness');
    });

    it('should evaluate local skill path', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockEvaluateResponse });

      await clientWithKey.evaluate({ target: './my_skills/web_search' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/evaluate',
        expect.objectContaining({
          target: './my_skills/web_search'
        })
      );
    });

    it('should throw error when target is missing', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });

      await expect(clientWithKey.evaluate({ target: '' }))
        .rejects.toThrow('Target is required');
    });

    it('should throw error on evaluate failure', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Evaluate failed'));

      await expect(clientWithKey.evaluate({ target: './skill' }))
        .rejects.toThrow('Evaluate failed');
    });
  });

  describe('Analyze', () => {
    const mockAnalyzeResponse = {
      success: true,
      relationships: [
        { source: 'PDF_Parser', type: 'compose_with', target: 'Text_Summarizer' },
        { source: 'Web_Scraper', type: 'depend_on', target: 'HTML_Parser' }
      ]
    };

    it('should require apiKey for analyze operation', async () => {
      await expect(client.analyze({ skillsDir: './my_skills' }))
        .rejects.toThrow('API key is required for analyze operation');
    });

    it('should analyze skill relationships', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockAnalyzeResponse });

      const relationships = await clientWithKey.analyze({ skillsDir: './my_skills' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/analyze',
        expect.objectContaining({
          skills_dir: './my_skills'
        })
      );
      expect(relationships).toHaveLength(2);
      expect(relationships[0].source).toBe('PDF_Parser');
      expect(relationships[0].type).toBe('compose_with');
      expect(relationships[0].target).toBe('Text_Summarizer');
    });

    it('should throw error when skillsDir is missing', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });

      await expect(clientWithKey.analyze({ skillsDir: '' }))
        .rejects.toThrow('Skills directory is required');
    });

    it('should throw error on analyze failure', async () => {
      const clientWithKey = new SkillNetClient({ apiKey: 'sk-test' });
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Analyze failed'));

      await expect(clientWithKey.analyze({ skillsDir: './skills' }))
        .rejects.toThrow('Analyze failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockAxiosInstance.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.search({ q: 'test' })).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle API errors with response data', async () => {
      mockAxiosInstance.get = jest.fn().mockRejectedValue({
        response: { data: { error: 'Invalid API key' } }
      });

      await expect(client.search({ q: 'test' })).rejects.toThrow();
    });
  });
});

describe('Type Definitions', () => {
  it('should export SearchMode enum', () => {
    expect(SearchMode.Keyword).toBe('keyword');
    expect(SearchMode.Vector).toBe('vector');
  });

  it('should export SortBy enum', () => {
    expect(SortBy.Stars).toBe('stars');
    expect(SortBy.Recent).toBe('recent');
  });

  it('should have correct EvaluationResult structure', () => {
    const evaluation: EvaluationResult = {
      safety: { level: 'Good', reason: 'Safe' },
      completeness: { level: 'Good', reason: 'Complete' },
      executability: { level: 'Good', reason: 'Executable' },
      maintainability: { level: 'Good', reason: 'Maintainable' },
      costAwareness: { level: 'Good', reason: 'Cost-aware' }
    };

    expect(evaluation.safety.level).toBe('Good');
    expect(evaluation.costAwareness.reason).toBe('Cost-aware');
  });

  it('should have correct Relationship structure', () => {
    const relationship: Relationship = {
      source: 'SkillA',
      type: 'compose_with',
      target: 'SkillB'
    };

    expect(relationship.source).toBe('SkillA');
    expect(relationship.type).toBe('compose_with');
    expect(relationship.target).toBe('SkillB');
  });
});
