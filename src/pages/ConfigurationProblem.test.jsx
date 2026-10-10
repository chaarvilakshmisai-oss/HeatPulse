import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConfigurationProblem } from '../App.jsx';

describe('configuration problem screen', () => {
  it('names the missing variables instead of rendering a blank page', () => {
    const html = renderToString(
      <ConfigurationProblem missing={['VITE_API_URL', 'VITE_USER_POOL_CLIENT_ID']} />
    );

    expect(html).toContain('Configuration problem');
    expect(html).toContain('VITE_API_URL');
    expect(html).toContain('VITE_USER_POOL_CLIENT_ID');
  });
});
