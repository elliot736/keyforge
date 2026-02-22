resource "aws_lb" "main" {
  name               = "${var.project}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.enable_deletion_protection

  tags = { Name = "${var.project}-${var.environment}-alb" }
}

# Dashboard listener (port 80)
# When a domain is set, redirect HTTP to HTTPS; otherwise forward directly.
resource "aws_lb_listener" "dashboard" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.domain != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.domain == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.dashboard.arn
    }
  }
}

# API listener (port 4000)
resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.main.arn
  port              = 4000
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# API target group
resource "aws_lb_target_group" "api" {
  name        = "${var.project}-${var.environment}-api"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = { Name = "${var.project}-${var.environment}-api-tg" }
}

# Dashboard target group
resource "aws_lb_target_group" "dashboard" {
  name        = "${var.project}-${var.environment}-dash"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200,302"
  }

  deregistration_delay = 30

  tags = { Name = "${var.project}-${var.environment}-dash-tg" }
}
