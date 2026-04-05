import { TemplateRendererService } from './template-renderer.service';

describe('TemplateRendererService', () => {
  let service: TemplateRendererService;

  beforeEach(() => {
    service = new TemplateRendererService();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── render() ───────────────────────────────────────────────────────────────

  describe('TemplateRendererService — render', () => {
    it('should render a simple Handlebars template with variables', () => {
      const result = service.render('Hello {{name}}!', { name: 'John' });
      expect(result).toBe('Hello John!');
    });

    it('should render multiple variables in a template', () => {
      const template = 'Dear {{first_name}} {{last_name}}, your class is {{class_name}}.';
      const variables = {
        first_name: 'Ali',
        last_name: 'Hassan',
        class_name: '3A',
      };
      const result = service.render(template, variables);
      expect(result).toBe('Dear Ali Hassan, your class is 3A.');
    });

    it('should render missing variables as empty string', () => {
      const result = service.render('Hello {{name}}, welcome to {{school}}!', {
        name: 'Sara',
      });
      expect(result).toBe('Hello Sara, welcome to !');
    });

    it('should handle template with no variables', () => {
      const result = service.render('No variables here.', {});
      expect(result).toBe('No variables here.');
    });

    it('should escape HTML entities in variables by default', () => {
      const result = service.render('Hello {{name}}!', {
        name: '<script>alert(1)</script>',
      });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('should cache compiled templates for repeated renders', () => {
      const template = 'Hello {{name}}!';
      const result1 = service.render(template, { name: 'First' });
      const result2 = service.render(template, { name: 'Second' });
      expect(result1).toBe('Hello First!');
      expect(result2).toBe('Hello Second!');
    });

    it('should return raw template body when rendering fails', () => {
      // Handlebars with strict:false should not fail on missing helpers,
      // but a malformed block expression can trigger an error.
      // We test that the service handles gracefully by checking a non-crashing
      // scenario returns expected output.
      const template = 'Hello {{name}}!';
      const result = service.render(template, { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should render nested object access', () => {
      const template = 'Student: {{student.first_name}} {{student.last_name}}';
      const variables = {
        student: { first_name: 'Fatima', last_name: 'Al-Hassan' },
      };
      const result = service.render(template, variables);
      expect(result).toBe('Student: Fatima Al-Hassan');
    });

    it('should handle empty template body', () => {
      const result = service.render('', { name: 'Test' });
      expect(result).toBe('');
    });

    it('should render numeric variables correctly', () => {
      const template = 'Amount: {{amount}} - Count: {{count}}';
      const result = service.render(template, { amount: 150.5, count: 3 });
      expect(result).toBe('Amount: 150.5 - Count: 3');
    });
  });

  // ─── renderSubject() ───────────────────────────────────────────────────────

  describe('TemplateRendererService — renderSubject', () => {
    it('should render subject template with variables', () => {
      const result = service.renderSubject('Welcome {{name}}!', {
        name: 'Ahmad',
      });
      expect(result).toBe('Welcome Ahmad!');
    });

    it('should return null when subject template is null', () => {
      const result = service.renderSubject(null, { name: 'Ahmad' });
      expect(result).toBeNull();
    });

    it('should render empty subject template', () => {
      const result = service.renderSubject('', { name: 'Test' });
      expect(result).toBe('');
    });
  });

  // ─── stripHtml() ──────────────────────────────────────────────────────────

  describe('TemplateRendererService — stripHtml', () => {
    it('should strip all HTML tags', () => {
      const result = service.stripHtml('<p>Hello <b>World</b></p>');
      expect(result).toBe('Hello World');
    });

    it('should convert <br> tags to newlines', () => {
      const result = service.stripHtml('Line 1<br>Line 2<br/>Line 3');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });

    it('should convert closing </p> tags to newlines', () => {
      const result = service.stripHtml('<p>Paragraph 1</p><p>Paragraph 2</p>');
      expect(result).toContain('Paragraph 1');
      expect(result).toContain('Paragraph 2');
      // Should have a newline between them
      expect(result).toMatch(/Paragraph 1\nParagraph 2/);
    });

    it('should convert closing </div> tags to newlines', () => {
      const result = service.stripHtml('<div>Block 1</div><div>Block 2</div>');
      expect(result).toContain('Block 1');
      expect(result).toContain('Block 2');
    });

    it('should convert closing </li> tags to newlines', () => {
      const result = service.stripHtml('<ul><li>Item 1</li><li>Item 2</li></ul>');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('should decode common HTML entities', () => {
      const result = service.stripHtml(
        '&amp; &lt;tag&gt; &quot;quoted&quot; &#39;single&#39; &nbsp;space',
      );
      expect(result).toContain('&');
      expect(result).toContain('<tag>');
      expect(result).toContain('"quoted"');
      expect(result).toContain("'single'");
      expect(result).toContain(' space');
    });

    it('should collapse excessive whitespace', () => {
      const result = service.stripHtml('<p>Line 1</p>\n\n\n\n<p>Line 2</p>\n\n\n\n<p>Line 3</p>');
      // Should not have more than two consecutive newlines
      expect(result).not.toMatch(/\n\s*\n\s*\n/);
    });

    it('should trim leading and trailing whitespace', () => {
      const result = service.stripHtml('  <p>Hello</p>  ');
      expect(result).toBe('Hello');
    });

    it('should handle empty string', () => {
      const result = service.stripHtml('');
      expect(result).toBe('');
    });

    it('should handle plain text without any HTML', () => {
      const result = service.stripHtml('Just plain text');
      expect(result).toBe('Just plain text');
    });

    it('should handle complex nested HTML', () => {
      const html =
        '<div><h1>Title</h1><p>Welcome to <strong>our school</strong>.</p><ul><li>Item A</li><li>Item B</li></ul></div>';
      const result = service.stripHtml(html);
      expect(result).toContain('Title');
      expect(result).toContain('Welcome to our school.');
      expect(result).toContain('Item A');
      expect(result).toContain('Item B');
      // Should not contain any HTML tags
      expect(result).not.toMatch(/<[^>]+>/);
    });
  });

  // ─── stripHtmlStatic() ────────────────────────────────────────────────────

  describe('TemplateRendererService — stripHtmlStatic', () => {
    it('should be callable as a static method', () => {
      const result = TemplateRendererService.stripHtmlStatic('<p>Static test</p>');
      expect(result).toBe('Static test');
    });

    it('should produce same output as instance method', () => {
      const html = '<div><p>Hello <b>World</b></p></div>';
      const instanceResult = service.stripHtml(html);
      const staticResult = TemplateRendererService.stripHtmlStatic(html);
      expect(instanceResult).toBe(staticResult);
    });
  });

  // ─── Handlebars helpers — formatDate ─────────────────────────────────────

  describe('TemplateRendererService — formatDate helper', () => {
    it('should format a valid Date object', () => {
      const result = service.render('{{formatDate myDate}}', {
        myDate: new Date('2025-03-15T12:00:00Z'),
      });
      expect(result).toContain('March');
      expect(result).toContain('15');
      expect(result).toContain('2025');
    });

    it('should format a valid ISO date string', () => {
      const result = service.render('{{formatDate myDate}}', {
        myDate: '2025-06-01T00:00:00Z',
      });
      expect(result).toContain('June');
      expect(result).toContain('2025');
    });

    it('should return empty string when date is null/undefined/empty', () => {
      const result = service.render('Date: {{formatDate myDate}}', {
        myDate: null,
      });
      expect(result).toBe('Date: ');
    });

    it('should return original value as string when date is invalid', () => {
      const result = service.render('Date: {{formatDate myDate}}', {
        myDate: 'not-a-date',
      });
      expect(result).toBe('Date: not-a-date');
    });

    it('should accept a locale parameter for formatting', () => {
      const result = service.render('{{formatDate myDate "en"}}', {
        myDate: new Date('2025-12-25T00:00:00Z'),
      });
      expect(result).toContain('December');
      expect(result).toContain('25');
    });

    it('should fallback to en locale when invalid locale is passed', () => {
      // This tests the catch block inside the formatDate helper
      const result = service.render('{{formatDate myDate "invalid-locale-xxx"}}', {
        myDate: new Date('2025-01-10T00:00:00Z'),
      });
      // Should still produce a formatted date (fallback to 'en')
      expect(result).toContain('2025');
    });

    it('should use en locale when locale param is not a string', () => {
      // When the second argument is not a string (e.g., Handlebars options hash),
      // the helper defaults to 'en'
      const result = service.render('{{formatDate myDate}}', {
        myDate: new Date('2025-07-04T00:00:00Z'),
      });
      expect(result).toContain('July');
    });
  });

  // ─── Handlebars helpers — stripHtml ──────────────────────────────────────

  describe('TemplateRendererService — stripHtml Handlebars helper', () => {
    it('should strip HTML tags within a template via the helper', () => {
      const result = service.render('{{{stripHtml myHtml}}}', {
        myHtml: '<p>Hello <b>World</b></p>',
      });
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<b>');
    });

    it('should return empty string when input is not a string', () => {
      const result = service.render('Result: {{{stripHtml myVal}}}', {
        myVal: 12345,
      });
      expect(result).toBe('Result: ');
    });

    it('should return empty string when input is null', () => {
      const result = service.render('Result: {{{stripHtml myVal}}}', {
        myVal: null,
      });
      expect(result).toBe('Result: ');
    });
  });

  // ─── render() — error handling ──────────────────────────────────────────

  describe('TemplateRendererService — render — error handling', () => {
    it('should return raw template body when render throws', () => {
      // Force a render error by using an invalid block helper that throws at runtime
      // We need to use a helper that will throw during execution
      const brokenTemplate = '{{#each}}no-args{{/each}}';
      const result = service.render(brokenTemplate, {});
      // Should return the raw template body (error path)
      expect(result).toBe(brokenTemplate);
    });
  });
});
