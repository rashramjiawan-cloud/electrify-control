import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

import VoltControlLogo from '@/components/VoltControlLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, Lock, User } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vul je emailadres in');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Reset-link verstuurd! Controleer je inbox.');
      setForgotPassword(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Ingelogd!');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: displayName },
          },
        });
        if (error) throw error;
        toast.success('Registratie gelukt! Controleer je email om te bevestigen.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <VoltControlLogo size="lg" />
          </div>
          <p className="text-sm text-muted-foreground">
            {forgotPassword ? 'Vul je email in om een reset-link te ontvangen' : isLogin ? 'Log in om door te gaan' : 'Maak een account aan'}
          </p>
        </div>

        {forgotPassword ? (
          <>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@voorbeeld.nl" className="pl-9 font-mono text-sm" required />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? 'Bezig...' : 'Reset-link versturen'}
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground">
              <button onClick={() => setForgotPassword(false)} className="text-primary hover:underline font-medium">
                Terug naar inloggen
              </button>
            </p>
          </>
        ) : (
          <>
            {/* Email Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Naam</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Je naam" className="pl-9 font-mono text-sm" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@voorbeeld.nl" className="pl-9 font-mono text-sm" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-muted-foreground">Wachtwoord</Label>
                  {isLogin && (
                    <button type="button" onClick={() => setForgotPassword(true)} className="text-xs text-primary hover:underline">
                      Wachtwoord vergeten?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 font-mono text-sm" required minLength={6} />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? 'Bezig...' : isLogin ? 'Inloggen' : 'Registreren'}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              {isLogin ? 'Nog geen account? ' : 'Al een account? '}
              <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
                {isLogin ? 'Registreren' : 'Inloggen'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Auth;
