package main

import "testing"

func TestParseServeDemoOptions(t *testing.T) {
	opts, args, err := parseCLIOptions([]string{"serve", "--demo", "--host", "0.0.0.0", "--port", "9090"})
	if err != nil {
		t.Fatalf("parseCLIOptions: %v", err)
	}
	if len(args) != 0 || !opts.Serve || !opts.Demo || opts.Host != "0.0.0.0" || opts.Port != 9090 {
		t.Fatalf("unexpected options: %#v args=%v", opts, args)
	}
}

func TestDemoRequiresServe(t *testing.T) {
	if _, _, err := parseCLIOptions([]string{"--demo"}); err == nil {
		t.Fatal("expected --demo without serve to fail")
	}
}

func TestHostRequiresServe(t *testing.T) {
	if _, _, err := parseCLIOptions([]string{"--host", "0.0.0.0"}); err == nil {
		t.Fatal("expected --host without serve to fail")
	}
}
