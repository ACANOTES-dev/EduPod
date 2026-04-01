const { RuleTester } = require('eslint');
const rule = require('../rules/no-hand-rolled-forms');

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
});

ruleTester.run('no-hand-rolled-forms', rule, {
  valid: [
    // Only 2 useState calls — below threshold
    {
      code: `
        const [name, setName] = React.useState('');
        const [email, setEmail] = React.useState('');
        const handleSubmit = () => {};
      `,
    },
    // 3+ useState but no form-field names
    {
      code: `
        const [isOpen, setIsOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const [page, setPage] = React.useState(1);
        const handleSubmit = () => {};
      `,
    },
    // 3+ useState with form-field names but no submit handler
    {
      code: `
        const [name, setName] = React.useState('');
        const [email, setEmail] = React.useState('');
        const [title, setTitle] = React.useState('');
      `,
    },
    // Component using react-hook-form (should not trigger)
    {
      code: `
        const [isOpen, setIsOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const [tab, setTab] = React.useState('general');
        const form = useForm({ resolver: zodResolver(schema) });
        const onSubmit = (data) => {};
      `,
    },
    // Non-form useState with onSubmit (no form-field-like names)
    {
      code: `
        const [count, setCount] = React.useState(0);
        const [isOpen, setIsOpen] = React.useState(false);
        const [loading, setLoading] = React.useState(false);
        const onSubmit = () => {};
      `,
    },
    // Plain useState without destructuring (not the pattern we target)
    {
      code: `
        const state1 = useState('');
        const state2 = useState('');
        const state3 = useState('');
        const onSubmit = () => {};
      `,
    },
  ],
  invalid: [
    // Classic hand-rolled form: 3+ useState, form-field names, handleSubmit arrow
    {
      code: `
        const [name, setName] = React.useState('');
        const [email, setEmail] = React.useState('');
        const [title, setTitle] = React.useState('');
        const handleSubmit = () => {};
      `,
      errors: [{ messageId: 'noHandRolledForms' }],
    },
    // Same with bare useState (no React. prefix)
    {
      code: `
        const [name, setName] = useState('');
        const [email, setEmail] = useState('');
        const [description, setDescription] = useState('');
        const onSubmit = () => {};
      `,
      errors: [{ messageId: 'noHandRolledForms' }],
    },
    // Mix of form and non-form useState, with function declaration submit
    {
      code: `
        const [name, setName] = React.useState('');
        const [loading, setLoading] = React.useState(false);
        const [amount, setAmount] = React.useState(0);
        function handleSubmit() {}
      `,
      errors: [{ messageId: 'noHandRolledForms' }],
    },
    // Form-field detected via setter name (setDate)
    {
      code: `
        const [foo, setDate] = React.useState('');
        const [bar, setNotes] = React.useState('');
        const [baz, setStatus] = React.useState('');
        const onSubmit = () => {};
      `,
      errors: [{ messageId: 'noHandRolledForms' }],
    },
    // handleSubmit as function expression
    {
      code: `
        const [name, setName] = useState('');
        const [email, setEmail] = useState('');
        const [value, setValue] = useState('');
        const handleSubmit = function() {};
      `,
      errors: [{ messageId: 'noHandRolledForms' }],
    },
  ],
});

console.log('no-hand-rolled-forms: all tests passed');
