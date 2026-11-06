import { ultimateHttpRequest } from './ultimateHttp';

// Minimal fake of Node's `http` module sufficient to drive
// ultimateHttpRequest's request/response/timeout/error handling without a
// real socket. Each test installs its own `window.require` mock returning
// a fake `http.request` whose behavior the test controls directly.
function makeFakeReq() {
  const handlers: Record<string, Function[]> = {};
  const req: any = {
    on: (event: string, cb: Function) => {
      (handlers[event] ??= []).push(cb);
      return req;
    },
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    emit: (event: string, ...args: any[]) => {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return req;
}

function makeFakeRes(statusCode: number, bodyChunks: string[]) {
  const handlers: Record<string, Function[]> = {};
  const res: any = {
    statusCode,
    on: (event: string, cb: Function) => {
      (handlers[event] ??= []).push(cb);
      return res;
    },
    emit: (event: string, ...args: any[]) => {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  // Defer emission so it happens after the Promise executor has wired up
  // its own handlers, matching real Node http's async callback timing.
  queueMicrotask(() => {
    for (const chunk of bodyChunks) res.emit('data', Buffer.from(chunk));
    res.emit('end');
  });
  return res;
}

describe('ultimateHttpRequest', () => {
  const originalRequire = (window as any).require;

  afterEach(() => {
    (window as any).require = originalRequire;
    jest.useRealTimers();
  });

  it('resolves with the response body on a 2xx status', async () => {
    const req = makeFakeReq();
    (window as any).require = jest.fn(() => ({
      request: (_opts: any, callback: any) => {
        callback(makeFakeRes(200, ['hello', ' world']));
        return req;
      },
    }));

    const result = await ultimateHttpRequest('GET', 'http://ultimate.local/v1/version');
    expect(result.toString('utf8')).toBe('hello world');
  });

  it('rejects with a descriptive error on a non-2xx status', async () => {
    const req = makeFakeReq();
    (window as any).require = jest.fn(() => ({
      request: (_opts: any, callback: any) => {
        callback(makeFakeRes(500, ['server exploded']));
        return req;
      },
    }));

    await expect(ultimateHttpRequest('PUT', 'http://ultimate.local/v1/machine:pause'))
      .rejects.toThrow(/HTTP 500/);
    await expect(ultimateHttpRequest('PUT', 'http://ultimate.local/v1/machine:pause'))
      .rejects.toThrow(/server exploded/);
  });

  it('rejects on a socket-level error event', async () => {
    const req = makeFakeReq();
    (window as any).require = jest.fn(() => ({
      request: () => req,
    }));

    const promise = ultimateHttpRequest('GET', 'http://ultimate.local/v1/version');
    req.emit('error', new Error('ECONNREFUSED'));
    await expect(promise).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects with a timeout error and destroys the request when no response arrives in time', async () => {
    jest.useFakeTimers();
    const req = makeFakeReq();
    (window as any).require = jest.fn(() => ({
      // Never calls the response callback -- simulates a dropped connection.
      request: () => req,
    }));

    const promise = ultimateHttpRequest('PUT', 'http://ultimate.local/v1/machine:pause', undefined, 5000);
    // Attach a rejection handler immediately so the eventual rejection
    // isn't reported as unhandled while fake timers advance below.
    const assertion = expect(promise).rejects.toThrow(/timed out after 5000ms/);

    jest.advanceTimersByTime(5000);
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
  });

  it('does not reject twice when both a late response and a timeout could fire', async () => {
    jest.useFakeTimers();
    const req = makeFakeReq();
    let deliverResponse: (() => void) | null = null;
    (window as any).require = jest.fn(() => ({
      request: (_opts: any, callback: any) => {
        deliverResponse = () => callback(makeFakeRes(200, ['late']));
        return req;
      },
    }));

    const promise = ultimateHttpRequest('GET', 'http://ultimate.local/v1/version', undefined, 1000);
    const assertion = expect(promise).rejects.toThrow(/timed out/);
    jest.advanceTimersByTime(1000);
    await assertion;

    // A response arriving after the timeout already fired must be ignored
    // (the Promise is already settled) rather than throwing an
    // unhandled "settled promise" error.
    expect(() => deliverResponse && deliverResponse()).not.toThrow();
  });
});
