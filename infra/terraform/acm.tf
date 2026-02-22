# ─── ACM Certificate (only when domain is set) ─────────────────────────────────

resource "aws_acm_certificate" "main" {
  count             = var.domain != "" ? 1 : 0
  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.project}-${var.environment}-cert" }
}

resource "aws_acm_certificate_validation" "main" {
  count                   = var.domain != "" ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ─── DNS Validation Records ────────────────────────────────────────────────────

data "aws_route53_zone" "main" {
  count = var.domain != "" ? 1 : 0
  name  = var.domain
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.domain != "" ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

# ─── HTTPS Listener (port 443) ─────────────────────────────────────────────────

resource "aws_lb_listener" "https" {
  count             = var.domain != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main[0].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }

  depends_on = [aws_acm_certificate_validation.main]
}
