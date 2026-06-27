import React from 'react';

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="py-12 text-center text-gray-500">
          {this.props.fallbackText || 'Section unavailable'}
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
