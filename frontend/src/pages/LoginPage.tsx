import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSuccess = async (credentialResponse: any) => {
    try {
      await login(credentialResponse.credential);
      navigate('/dashboard');
    } catch (error) {
      alert('Login failed. Please try again.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white">
      <div className="p-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
        <p className="text-neutral-400 mb-8">Sign in to your BritTrade account</p>
        
        <div className="flex justify-center mb-6">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => {
              console.log('Login Failed');
            }}
            useOneTap
            theme="filled_black"
            shape="pill"
          />
        </div>

        <p className="text-xs text-neutral-500">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
