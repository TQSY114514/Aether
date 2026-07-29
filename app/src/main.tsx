import React from 'react'
import { Component } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { UIProvider } from './components/ui/feedback'
import './index.css'

class AppBoundary extends Component<{children:React.ReactNode},{error?:Error}> {
  state:{error?:Error}={}
  static getDerivedStateFromError(e:Error){return{error:e}}
  componentDidCatch(e:Error){console.error('[AetherAI] CRASH:',e)}
  render(){
    if(this.state.error)return(
      <div style={{padding:40,fontFamily:'Inter,sans-serif'}}>
        <h2 style={{color:'#DC2626'}}>AetherAI Crashed</h2>
        <pre style={{marginTop:12,padding:16,background:'#F8F9FA',borderRadius:8,fontSize:13,overflow:'auto',whiteSpace:'pre-wrap'}}>
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
        <p style={{marginTop:16,color:'#6B7280',fontSize:13}}>Copy this and report it.</p>
        <button onClick={()=>this.setState({error:undefined})} style={{marginTop:8,padding:'6px 16px',background:'#2563EB',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:13}}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBoundary>
    <UIProvider>
    <App />
    </UIProvider>
    </AppBoundary>
  </React.StrictMode>,
)
