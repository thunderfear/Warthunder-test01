import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 3D渲染错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          width: '100%', height: '100%', minHeight: 400,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#1e2d3d', color: '#ff4d4d', fontSize: 14,
          borderRadius: 10, gap: 12,
        }}>
          <div>3D 场景加载失败</div>
          <div style={{ color: '#8a9db3', fontSize: 12 }}>
            {this.state.error?.message ?? '未知错误'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8, padding: '6px 16px',
              background: '#0e5a5a', color: '#34e1e1',
              border: '1px solid #1b8c8c', borderRadius: 6,
              cursor: 'pointer', fontSize: 12,
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
