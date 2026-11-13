// Generates the expected bytes in tests/kosovo.test.ts with ATK's own Go library.
// Run from a clone of github.com/fiskalizimi/pos-golang: copy to fiskalizimi/cmd/vectors/main.go and `go run ./cmd/vectors`.
// `go run ./cmd/vectors verify < check.json` checks a signature and CSR made by this app.
//go:build ignore

package main

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fiskalizimi/proto"
	"fmt"
	"os"

	pb "google.golang.org/protobuf/proto"
)

const T = 1727151089

func main() {
	if len(os.Args) > 1 && os.Args[1] == "verify" {
		verify()
		return
	}
	tg := []*proto.TaxGroup{
		{TaxRate: "C", TotalForTax: 450, TotalTax: 0},
		{TaxRate: "D", TotalForTax: 296, TotalTax: 24},
		{TaxRate: "E", TotalForTax: 889, TotalTax: 161},
	}
	cz := &proto.CitizenCoupon{BusinessId: 60100, PosId: 1, CouponId: 10, Type: proto.CouponType_Sale, Time: T, Total: 1820, TaxGroups: tg, TotalTax: 185, TotalNoTax: 1635}
	pos := &proto.PosCoupon{
		BusinessId: 60100, CouponId: 10, BranchId: 1, Location: "Prishtinë", OperatorId: "Kushtrimi", PosId: 1, ApplicationId: 1234,
		ReferenceNo: 0, VerificationNo: "1234567890123456", Type: proto.CouponType_Sale, Time: T,
		Items: []*proto.CouponItem{
			{Name: "uje rugove", Price: 15000, Unit: "cope", Quantity: 3, Total: 450, TaxRate: "C", Type: "TT"},
			{Name: "qumësht", Price: 30000, Unit: "KGN", Quantity: 0.375, Total: 600, TaxRate: "E", Type: "AU"},
		},
		Payments:  []*proto.Payment{{Type: proto.PaymentType_Cash, Amount: 500}, {Type: proto.PaymentType_CreditCard, Amount: 1000}},
		Total:     1820, TaxGroups: tg, TotalTax: 185, TotalNoTax: 1635, TotalDiscount: 25,
	}
	ret := &proto.PosCoupon{BusinessId: 810000000, CouponId: 100000010000000042, BranchId: 1, PosId: 1, ApplicationId: 99, VerificationNo: "ABCD", Type: proto.CouponType_Return, Time: T, ReferenceNo: 100000010000000041, Total: 99}
	a, _ := pb.Marshal(cz)
	b, _ := pb.Marshal(pos)
	c, _ := pb.Marshal(ret)
	out, _ := json.Marshal(map[string]string{"citizen": base64.StdEncoding.EncodeToString(a), "pos": base64.StdEncoding.EncodeToString(b), "ret": base64.StdEncoding.EncodeToString(c)})
	fmt.Println(string(out))
}

// verify reads JSON {spki, text, sig, csr} from stdin and checks them the way ATK would.
func verify() {
	var in struct{ Spki, Text, Sig, Csr string }
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		panic(err)
	}
	der, _ := base64.StdEncoding.DecodeString(in.Spki)
	k, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		panic(err)
	}
	sig, _ := base64.StdEncoding.DecodeString(in.Sig)
	h := sha256.Sum256([]byte(in.Text))
	fmt.Println("sig", ecdsa.VerifyASN1(k.(*ecdsa.PublicKey), h[:], sig))
	blk, _ := pem.Decode([]byte(in.Csr))
	csr, err := x509.ParseCertificateRequest(blk.Bytes)
	if err != nil {
		panic(err)
	}
	fmt.Println("csr", csr.CheckSignature() == nil, csr.Subject.String())
}
