// What tests/docs.spec.js holds QuickMusic's docs site to. The spec is shared
// across the extensions; this file is QuickMusic's own.

export default {
    title: 'QuickMusic',
    site: 'https://ghost-assembly.com/quickmusic/',
    repo: 'https://github.com/Ghost-Assembly/quickmusic',

    // [id, heading], in page order. The contents list must match.
    sections: [
        ['overview', 'Overview'],
        ['install', 'Install'],
        ['players', 'Players'],
        ['preferences', 'Preferences'],
        ['keyboard', 'Keyboard'],
        ['architecture', 'Architecture'],
        ['testing', 'Testing'],
        ['packaging', 'Packaging'],
        ['releasing', 'Releasing'],
        ['development', 'Development'],
    ],
};
