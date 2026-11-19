output "instance_id" {
  description = "DeployHub EC2 Instance ID"
  value       = aws_instance.deployhub_server.id
}

output "public_ip" {
  description = "DeployHub Elastic IP Address"
  value       = aws_eip.deployhub_eip.public_ip
}

output "web_ui_url" {
  description = "Direct HTTP URL to access DeployHub"
  value       = "http://${aws_eip.deployhub_eip.public_ip}:3000"
}

output "oauth_callback_url" {
  description = "GitHub OAuth App Authorization Callback URL"
  value       = "http://${aws_eip.deployhub_eip.public_ip}:3000/auth/callback"
}

