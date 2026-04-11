import axios from 'axios';
import { VM } from 'vm2';

export async function executeBuiltinSkill(type: string, params: Record<string, any>): Promise<any> {
  switch (type) {
    case 'time':
      return executeTimeSkill();
    case 'http':
      return executeHttpSkill(params);
    case 'json':
      return executeJsonSkill(params);
    case 'regex':
      return executeRegexSkill(params);
    case 'calculator':
      return executeCalculatorSkill(params);
    case 'code':
      return executeCodeSkill(params);
    default:
      throw new Error(`Unknown builtin skill type: ${type}`);
  }
}

function executeTimeSkill(): any {
  const now = new Date();
  return {
    datetime: now.toISOString(),
    timestamp: now.getTime(),
    date: now.toDateString(),
    time: now.toTimeString(),
  };
}

async function executeHttpSkill(params: any): Promise<any> {
  const { url, method = 'GET', headers = {}, body } = params;

  if (!url) {
    throw new Error('URL is required for HTTP skill');
  }

  try {
    const response = await axios({
      url,
      method,
      headers,
      data: body,
      timeout: 10000, // 10 秒超时
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    throw new Error(`HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function executeJsonSkill(params: any): any {
  const { action, data } = params;

  if (!action) {
    throw new Error('Action is required for JSON skill');
  }

  switch (action) {
    case 'parse':
      if (typeof data !== 'string') {
        throw new Error('Data must be a string for parse action');
      }
      try {
        return { result: JSON.parse(data) };
      } catch (error) {
        throw new Error('Invalid JSON');
      }
    case 'stringify':
      try {
        return { result: JSON.stringify(data) };
      } catch (error) {
        throw new Error('Failed to stringify data');
      }
    default:
      throw new Error(`Unknown JSON action: ${action}`);
  }
}

function executeRegexSkill(params: any): any {
  const { text, pattern, flags = '' } = params;

  if (!text || !pattern) {
    throw new Error('Text and pattern are required for regex skill');
  }

  try {
    const regex = new RegExp(pattern, flags);
    const matches = text.match(regex);

    return {
      matches: matches || [],
      groups: matches?.groups || {},
    };
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function executeCalculatorSkill(params: any): any {
  const { expression } = params;

  if (!expression || typeof expression !== 'string') {
    throw new Error('expression (string) is required for calculator skill');
  }

  // Validate: only allow digits, operators, parentheses, spaces, dots
  if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
    throw new Error('Invalid expression: only numbers and basic operators (+, -, *, /, %, ^, parentheses) are allowed');
  }

  try {
    // Replace ^ with ** for exponentiation
    const sanitized = expression.replace(/\^/g, '**');
    const vm = new VM({ timeout: 1000, sandbox: {} });
    const result = vm.run(sanitized);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Expression did not evaluate to a valid number');
    }

    return { expression, result };
  } catch (error) {
    throw new Error(`Calculator error: ${error instanceof Error ? error.message : 'Invalid expression'}`);
  }
}

function executeCodeSkill(params: any): any {
  const { code, language = 'javascript' } = params;

  if (!code || typeof code !== 'string') {
    throw new Error('code (string) is required for code execution skill');
  }

  if (language !== 'javascript') {
    throw new Error('Currently only JavaScript code execution is supported');
  }

  try {
    const logs: string[] = [];
    const vm = new VM({
      timeout: 5000,
      sandbox: {
        console: {
          log: (...args: any[]) => logs.push(args.map(String).join(' ')),
          warn: (...args: any[]) => logs.push('[WARN] ' + args.map(String).join(' ')),
          error: (...args: any[]) => logs.push('[ERROR] ' + args.map(String).join(' ')),
        },
      },
    });
    const result = vm.run(code);

    return {
      result: result !== undefined ? result : null,
      logs,
    };
  } catch (error) {
    throw new Error(`Code execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
