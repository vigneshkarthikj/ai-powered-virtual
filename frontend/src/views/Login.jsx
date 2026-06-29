import React, { useState } from 'react';

const API_URL = "https://ai-powered-virtual.onrender.com";
function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('Computer Science & Engineering');
  const [year, setYear] = useState(2);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password fields themed around NIC 2620
  const [nicCode, setNicCode] = useState('');
  const [manufacturingUnit, setManufacturingUnit] = useState('Desktop & Laptop Computers');
  const [securityAnswer, setSecurityAnswer] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isForgotPassword) {
      fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          new_password: password,
          nic_code: nicCode,
          manufacturing_unit: manufacturingUnit,
          security_answer: securityAnswer
        })
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.detail || 'Password reset failed');
          }
          return data;
        })
        .then((data) => {
          setIsForgotPassword(false);
          setError('Password reset successfully! Please sign in with your new password.');
          setPassword('');
          setNicCode('');
          setSecurityAnswer('');
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
      return;
    }

    const endpoint = isRegister
  ? `${API_URL}/api/auth/register`
  : `${API_URL}/api/auth/login`;
    const bodyData = isRegister 
      ? { name, email, password, branch, year: parseInt(year) }
      : { email, password };

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyData)
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Authentication failed');
        }
        return data;
      })
      .then((data) => {
        if (isRegister) {
          // Auto login after registration
          setIsRegister(false);
          setError('Account created successfully! Please log in.');
          setLoading(false);
        } else {
          onLogin(data.access_token);
        }
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative blurred glow circles */}
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
        top: '-10%',
        left: '-10%',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
        bottom: '-10%',
        right: '-10%',
        zIndex: 0
      }} />

      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '480px',
        padding: '40px',
        borderRadius: '24px',
        zIndex: 1,
        position: 'relative'
      }}>
        {/* Logo/Icon */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="float-anim" style={{
            fontSize: '48px',
            marginBottom: '12px',
            display: 'inline-block'
          }}>
            {isForgotPassword ? '🔒' : '🎓'}
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '800' }}>
            {isForgotPassword ? 'Reset Password' : isRegister ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            {isForgotPassword 
              ? 'Authorized Hardware Manufacturing Unit Verification (NIC 2620)' 
              : isRegister ? 'Join your Virtual Academic Assistant' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: error.includes('successfully') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${error.includes('successfully') ? 'var(--success)' : 'var(--danger)'}`,
            color: error.includes('successfully') ? '#34d399' : '#f87171',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Full Name
              </label>
              <input
                type="text"
                className="input-glass"
                placeholder="E.g. Karthik"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Email Address
            </label>
            <input
              type="email"
              className="input-glass"
              placeholder="name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
              {isForgotPassword ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              className="input-glass"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isForgotPassword && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  NIC Code Verification
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="Enter 4-digit NIC code (e.g. 2620)"
                  value={nicCode}
                  onChange={(e) => setNicCode(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Manufacturing Segment
                </label>
                <select
                  className="input-glass"
                  value={manufacturingUnit}
                  onChange={(e) => setManufacturingUnit(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Desktop & Laptop Computers">Desktop & Laptop Computers</option>
                  <option value="Storage Devices">Magnetic/Optical Storage Devices</option>
                  <option value="Displays & Monitors">Computer Monitors/Displays</option>
                  <option value="Input Peripherals">Keyboards, Mice & Input Devices</option>
                  <option value="Printers & Scanners">Printers, Scanners & Plotters</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Industrial Vertical Security Question:
                  <div style={{ textTransform: 'none', color: '#a855f7', fontWeight: 'bold', marginTop: '2px' }}>
                    What industrial category does NIC Code 2620 correspond to?
                  </div>
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="E.g., Manufacture of computers and peripheral equipment"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {isRegister && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Branch
                </label>
                <select 
                  className="input-glass"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Computer Science & Engineering">CSE</option>
                  <option value="Information Technology">IT</option>
                  <option value="Electronics & Communication">ECE</option>
                  <option value="Electrical Engineering">EE</option>
                  <option value="Mechanical Engineering">ME</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Year
                </label>
                <select 
                  className="input-glass"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                </select>
              </div>
            </div>
          )}

          {!isRegister && !isForgotPassword && (
            <div style={{ textAlign: 'right', marginTop: '-8px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ marginTop: '12px', padding: '14px' }}
            disabled={loading}
          >
            {loading 
              ? 'Processing...' 
              : isForgotPassword ? 'Reset Password' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-glass)',
          fontSize: '14px'
        }}>
          {isForgotPassword ? (
            <>
              <span style={{ color: 'var(--text-muted)' }}>Remember your password? </span>
              <button 
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--text-muted)' }}>
                {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              </span>
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isRegister ? 'Sign In' : 'Create One'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
