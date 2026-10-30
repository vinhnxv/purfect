// DashScope (Alibaba Cloud Model Studio) is set up the way its own tools are: DASHSCOPE_API_KEY, and
// DASHSCOPE_API_HOST for a workspace host such as <workspace>.ap-southeast-1.maas.aliyuncs.com.
// Both are only fallbacks: PURFECT_VOICE_DASHSCOPE_* / PURFECT_SPEECH_DASHSCOPE_* and the config
// file take precedence, so voice and speech can still use different keys.
const PUBLIC_HOST = 'dashscope-intl.aliyuncs.com';

export const dashscopeApiKey = () => process.env.DASHSCOPE_API_KEY || undefined;

// Accepts the host with or without a scheme or trailing slash.
export const dashscopeBaseUrl = () => `https://${(process.env.DASHSCOPE_API_HOST || PUBLIC_HOST).replace(/^\w+:\/\//, '').replace(/\/+$/, '')}`;
