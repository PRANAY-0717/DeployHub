variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance size (t3.medium recommended for Docker + Kubernetes builds)"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "Existing AWS SSH key pair name to attach to instance"
  type        = string
  default     = ""
}

variable "admin_cidr" {
  description = "CIDR block permitted for administrative SSH access (e.g. your IP: x.x.x.x/32)"
  type        = string
  default     = "0.0.0.0/0"
}

